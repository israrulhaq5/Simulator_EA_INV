'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { REGISTER_TYPES } = require('../src/constants/modbus');
const { SimulatorDevice } = require('../src/simulator/simulator-device');
const { KNOX_ASW110_PROFILE, wireAddress } = require('../src/seed/knox-asw110.profile');
const { createRegisterProfileBodySchema } = require('../src/validators/register-profile.validator');

function knox() {
  return new SimulatorDevice({
    key: 'knox',
    deviceType: 'Knox 110 kW inverter',
    profile: KNOX_ASW110_PROFILE,
    defaultConfiguration: {
      host: '127.0.0.1',
      port: 502,
      unitId: 3,
      updateIntervalMs: 1000,
      options: { ratingKw: 110, availabilityPct: 80, loadKw: 100 },
    },
  });
}

test('Knox profile passes the same schema as physical inverter maps', () => {
  const parsed = createRegisterProfileBodySchema.parse(KNOX_ASW110_PROFILE);
  assert.equal(parsed.identifier, 'knox-asw110');
  assert.equal(parsed.registers.length, 64);
});

test('Knox manual references resolve to zero-based FC04/FC03 wire addresses', () => {
  assert.equal(wireAddress(31001), 1000);
  assert.equal(wireAddress(31371), 1370);
  assert.equal(wireAddress(45403), 5402);
  assert.throws(() => wireAddress(60000), /Unsupported/);

  const active = KNOX_ASW110_PROFILE.registers.find(r => r.key === 'active_power');
  const limit = KNOX_ASW110_PROFILE.registers.find(r => r.key === 'active_power_set');
  assert.equal(active.registerType, REGISTER_TYPES.INPUT);
  assert.equal(active.address, 1370);
  assert.equal(active.length, 2);
  assert.equal(active.unit, 'W');
  assert.equal(limit.registerType, REGISTER_TYPES.HOLDING);
  assert.equal(limit.address, 5402);
  assert.equal(limit.scaleFactor, 0.01);
  assert.equal(limit.length, 1);
  assert.equal(limit.writable, true);
});

test('Knox defaults port 502/unit 3 and serves 110 kW rated register', () => {
  const sim = knox();
  assert.equal(sim.getStatus().port, 502);
  assert.equal(sim.getStatus().unitId, 3);
  sim.tick();
  assert.equal(sim.values.get('rated_power').value, 110000);
  assert.equal(sim.values.get('modbus_address').value, 3);
  assert.equal(sim.read(REGISTER_TYPES.INPUT, 1370, 3), 1);
  // 88 kW at 80% availability (32-bit big endian: high word = 1, low = 22464).
  assert.equal(sim.values.get('active_power').value, 88000);
});

test('FC06 at wire 5402 derates Knox from 88 kW to 44 kW and reads back 50%', () => {
  const sim = knox();
  sim.tick();
  assert.equal(sim.values.get('active_power').value, 88000);
  sim.write(REGISTER_TYPES.HOLDING, 5402, [5000], 3);
  sim.tick();
  assert.equal(sim.getStatus().deratingPercent, 50);
  assert.equal(sim.values.get('active_power').value, 44000);
  assert.equal(sim.read(REGISTER_TYPES.HOLDING, 5402, 3), 5000);
  assert.equal(sim.values.get('active_power_set').value, 50);
});

test('Knox rejects illegal raw derating and wrong unit without changing state', () => {
  const sim = knox();
  sim.tick();
  assert.throws(
    () => sim.write(REGISTER_TYPES.HOLDING, 5402, [12000], 3),
    error => error.modbusErrorCode === 3,
  );
  assert.equal(sim.model.deratingRaw, 10000);
  assert.throws(
    () => sim.read(REGISTER_TYPES.INPUT, 1370, 9),
    error => error.modbusErrorCode === 2,
  );
});

test('Knox slave ID and TCP port remain editable and input register 31002 tracks ID', () => {
  const sim = knox();
  sim.configure({ port: 15024, unitId: 12 });
  sim.tick();
  assert.equal(sim.getStatus().port, 15024);
  assert.equal(sim.getStatus().unitId, 12);
  assert.equal(sim.values.get('modbus_address').value, 12);
  assert.equal(sim.read(REGISTER_TYPES.INPUT, 1001, 12), 12);
});

test('remote switch and active power control commands update simulated production', () => {
  const sim = knox();
  sim.tick();
  sim.write(REGISTER_TYPES.HOLDING, 200, [0], 3); // document 40201: OFF
  sim.tick();
  assert.equal(sim.values.get('active_power').value, 0);
  sim.write(REGISTER_TYPES.HOLDING, 200, [1], 3); // ON
  sim.write(REGISTER_TYPES.HOLDING, 5402, [3000], 3); // 30%
  sim.tick();
  assert.equal(sim.values.get('active_power').value, 26400);
  sim.write(REGISTER_TYPES.HOLDING, 4000, [0], 3); // control disabled
  sim.tick();
  assert.equal(sim.values.get('active_power').value, 88000);
});

test('real TCP master reads Knox FC04 and writes FC06 power limit', async () => {
  const net = require('node:net');
  const ModbusRTU = require('modbus-serial');
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));

  // Test on a free high port: port 502 is a deployment default, not
  // required for test runners that do not have elevated bind permissions.
  const sim = knox();
  sim.configure({ host: '127.0.0.1', port });
  const client = new ModbusRTU();
  try {
    await sim.start();
    await client.connectTCP('127.0.0.1', { port });
    client.setID(3);
    client.setTimeout(3000);

    const powerBefore = await client.readInputRegisters(1370, 2);
    assert.deepEqual(powerBefore.data, [1, 22464]); // 88000W

    await client.writeRegister(5402, 5000);
    sim.tick();
    const limitReadback = await client.readHoldingRegisters(5402, 1);
    assert.deepEqual(limitReadback.data, [5000]);

    const powerAfter = await client.readInputRegisters(1370, 2);
    assert.deepEqual(powerAfter.data, [0, 44000]); // 44000W
  } finally {
    await new Promise(resolve => client.isOpen ? client.close(resolve) : resolve());
    await sim.stop();
  }
});
