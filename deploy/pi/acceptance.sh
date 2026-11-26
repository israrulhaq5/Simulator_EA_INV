#!/usr/bin/env bash
set -euo pipefail
base=http://127.0.0.1:8080
curl -fsS "$base/" >/dev/null
curl -fsS "$base/ready" | python3 -c 'import json,sys; p=json.load(sys.stdin); assert p["success"] and p["data"]["database"]["engine"]=="sqlite" and p["data"]["database"]["connected"]'
curl -fsS "$base/api/v1/register-profiles/export" | python3 -c 'import json,sys; p=json.load(sys.stdin); assert p["profileCount"]>=4'
curl -fsS "$base/api/v1/simulator" | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]["devices"]; assert all(d[k]["state"]=="RUNNING" for k in ("em500","huawei","solis","sungrow"))'
for device in em500 huawei solis sungrow; do
  curl -fsS "$base/api/v1/simulator/values?device=$device" | python3 -c 'import json,sys; p=json.load(sys.stdin); assert p["success"] and len(p["data"])>0'
done
for path in gateway zero-export; do
  curl -fsS "$base/api/v1/$path" | python3 -c 'import json,sys; p=json.load(sys.stdin); assert p["success"] and p["data"]["configuration"]["enabled"] is False and p["data"]["status"]["running"] is False'
done
sqlite3 /var/lib/zero-export-pi/zero-export.sqlite 'PRAGMA quick_check;' | grep -qx ok
# Read mapped registers through each deployed Modbus TCP listener.
cd /opt/automatrix/zero-export-pi/backend
/opt/automatrix/node-pi-22/bin/node <<'JS'
const assert = require('node:assert/strict');
const ModbusRTU = require('modbus-serial');
(async () => {
  const response = await fetch('http://127.0.0.1:3001/api/v1/simulator');
  const { data } = await response.json();
  const registers = {
    em500: ['readHoldingRegisters', 2, 2],
    huawei: ['readHoldingRegisters', 32080, 2],
    solis: ['readInputRegisters', 3033, 1],
    sungrow: ['readHoldingRegisters', 5007, 1],
  };
  for (const [key, [read, address, count]] of Object.entries(registers)) {
    const device = data.devices[key];
    const client = new ModbusRTU();
    try {
      await client.connectTCP('127.0.0.1', { port: device.port });
      client.setID(device.unitId);
      client.setTimeout(3000);
      const { data: words } = await client[read](address, count);
      assert.equal(words.length, count, key);
      assert.ok(words.every(word => Number.isInteger(word) && word >= 0 && word <= 65535), key);
      console.log(`${key}: ${read}(${address}, ${count}) => ${words.join(', ')}`);
    } finally {
      if (client.isOpen) await new Promise(resolve => client.close(resolve));
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
JS
echo "ACCEPTANCE PASS: UI, SQLite, four simulator listeners, live values, disabled physical control."
