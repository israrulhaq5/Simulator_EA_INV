'use strict';

// Local-only acceptance: creates an isolated Knox Modbus TCP test slave on
// 127.0.0.1. It NEVER connects to the internet or to a physical inverter.
const assert = require('node:assert/strict');
const net = require('node:net');
const ModbusRTU = require('modbus-serial');
const { SimulatorDevice } = require('../src/simulator/simulator-device');
const { KNOX_ASW110_PROFILE } = require('../src/seed/knox-asw110.profile');

const HOST = '127.0.0.1';
const FIRST_PORT = 502;
const FIRST_ID = 3;
const SECOND_ID = 17;

async function availablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, HOST, resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function makeSimulator() {
  return new SimulatorDevice({
    key: 'knox',
    deviceType: 'Knox 110 kW inverter',
    profile: KNOX_ASW110_PROFILE,
    defaultConfiguration: {
      host: HOST,
      port: FIRST_PORT,
      unitId: FIRST_ID,
      updateIntervalMs: 1000,
      options: { ratingKw: 110, availabilityPct: 80, loadKw: 100 },
    },
  });
}

async function closeClient(client) {
  if (!client?.isOpen) return;
  await new Promise((resolve) => client.close(resolve));
}

async function openClient(port, unitId) {
  const client = new ModbusRTU();
  client.setTimeout(3000);
  try {
    await client.connectTCP(HOST, { port });
    client.setID(unitId);
    return client;
  } catch (error) {
    await closeClient(client);
    throw error;
  }
}

async function assertPower(client, expectedWatts, message) {
  const data = (await client.readInputRegisters(1370, 2)).data;
  const buffer = Buffer.alloc(4);
  buffer.writeUInt16BE(data[0], 0);
  buffer.writeUInt16BE(data[1], 2);
  const actualWatts = buffer.readInt32BE(0);
  assert.equal(actualWatts, expectedWatts, message);
  process.stdout.write('PASS ' + message + ' (' + actualWatts + ' W)' + '\n');
}

async function main() {
  const simulator = makeSimulator();
  let client;
  process.stdout.write('Knox localhost-only Modbus TCP acceptance test' + '\n');
  process.stdout.write('No physical inverter will be contacted. Test address: ' + HOST + ':' + FIRST_PORT + '\n');
  try {
    try {
      await simulator.start();
    } catch (error) {
      if (error.code === 'EADDRINUSE' || /EADDRINUSE|address already in use/i.test(error.message)) {
        throw new Error('TCP port 502 is already in use. Stop any running Knox simulator or other Modbus server and rerun. Details: ' + error.message);
      }
      if (error.code === 'EACCES' || /EACCES|permission denied/i.test(error.message)) {
        throw new Error('Binding port 502 was denied by the OS. Run in an environment allowed to bind port 502. Details: ' + error.message);
      }
      throw error;
    }
    assert.equal(simulator.getStatus().state, 'RUNNING');
    process.stdout.write('PASS Modbus TCP server started on ' + HOST + ':' + FIRST_PORT + ', Slave ID ' + FIRST_ID + '\n');
    client = await openClient(FIRST_PORT, FIRST_ID);

    assert.deepEqual((await client.readInputRegisters(1001, 1)).data, [FIRST_ID]);
    process.stdout.write('PASS FC04: configured Slave ID register' + '\n');

    await assertPower(client, 88000, 'FC04: 110 kW rated at 80% availability');

    await client.writeRegister(5402, 5000);
    simulator.tick();
    assert.deepEqual((await client.readHoldingRegisters(5402, 1)).data, [5000]);
    process.stdout.write('PASS FC06 write + FC03 readback: 5000 raw = 50.00%' + '\n');
    await assertPower(client, 44000, 'FC04 power follows 50% setpoint');

    await client.writeRegister(200, 0);
    simulator.tick();
    await assertPower(client, 0, 'FC06 remote OFF stops output');
    await client.writeRegister(200, 1);
    simulator.tick();
    await assertPower(client, 44000, 'FC06 remote ON resumes limited output');

    await closeClient(client);
    client = null;
    await simulator.stop();

    const secondPort = await availablePort();
    simulator.configure({ port: secondPort, unitId: SECOND_ID });
    await simulator.start();
    client = await openClient(secondPort, SECOND_ID);
    assert.deepEqual((await client.readInputRegisters(1001, 1)).data, [SECOND_ID]);
    process.stdout.write('PASS editable port ' + secondPort + ' and Slave ID ' + SECOND_ID + '\n');
    await client.writeRegister(5402, 2500);
    simulator.tick();
    await assertPower(client, 22000, 'FC06 25% command works after changing port and ID');

    process.stdout.write('PASS: localhost Modbus TCP acceptance complete.' + '\n');
  } finally {
    await closeClient(client);
    await simulator.stop();
  }
}

main().catch((error) => {
  process.stderr.write('FAIL Knox TCP acceptance: ' + (error.stack || error.message) + '\n');
  process.exitCode = 1;
});
