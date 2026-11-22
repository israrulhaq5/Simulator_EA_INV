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
  const p = sim.values.get('active_power').value;
  const q = sim.values.get('reactive_power').value;
  const s = sim.values.get('apparent_power').value;
  assert.ok(Math.abs(Math.sqrt(p * p + q * q) - s) < 5, 'P/Q/S should be internally consistent');
  assert.equal(sim.values.get('power_factor').value, 0.99);
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

test('port/ID conflict is rejected before persistence or interrupting an existing slave', async () => {
  const { getStatus, getDevice, stopDevice } = require('../src/simulator');
  const SimulatorController = require('../src/controllers/simulator.controller');
  await stopDevice('knox');
  const sim = getDevice('knox');
  const before = sim.getStatus();
  let saved = 0;
  const controller = new SimulatorController(
    { getStatus, getDevice, getValues: () => [] },
    { save: async () => { saved += 1; } },
    { findOne: async () => null },
  );
  // Solis has port 15022 / unit 3; Knox must not duplicate it.
  await assert.rejects(
    controller.updateDevice({
      validated: {
        params: { deviceKey: 'knox' },
        body: { port: 15022, unitId: 3 },
      },
    }, {}),
    error => error.statusCode === 422,
  );
  assert.equal(saved, 0);
  assert.equal(sim.getStatus().port, before.port);
  assert.equal(sim.getStatus().unitId, before.unitId);
});

test('persistence failure leaves Knox TCP port and ID unchanged', async () => {
  const { getStatus, getDevice, stopDevice } = require('../src/simulator');
  const SimulatorController = require('../src/controllers/simulator.controller');
  await stopDevice('knox');
  const sim = getDevice('knox');
  const before = sim.getStatus();
  const controller = new SimulatorController(
    { getStatus, getDevice, getValues: () => [] },
    { save: async () => { throw new Error('simulated MongoDB unavailable'); } },
    { findOne: async () => null },
  );
  await assert.rejects(
    controller.updateDevice({
      validated: {
        params: { deviceKey: 'knox' },
        body: { port: 16025, unitId: 23 },
      },
    }, {}),
    /simulated MongoDB unavailable/,
  );
  assert.equal(sim.getStatus().port, before.port);
  assert.equal(sim.getStatus().unitId, before.unitId);
});

test('Knox solar availability can change live without stopping its TCP server', () => {
  const sim = knox();
  sim.state = 'RUNNING';
  const before = sim.getStatus();
  sim.configure({ options: { availabilityPct: 35 } });
  assert.equal(sim.getStatus().state, 'RUNNING');
  assert.equal(sim.getStatus().port, before.port);
  sim.tick();
  assert.equal(sim.values.get('active_power').value, 38500);
  assert.throws(() => sim.configure({ unitId: 42 }), /Stop the simulator/);
});

test('real Modbus TCP master can connect on an edited port and unit ID', async () => {
  const net = require('node:net');
  const ModbusRTU = require('modbus-serial');
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const newPort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));

  const sim = knox();
  sim.configure({ host: '127.0.0.1', port: newPort, unitId: 17 });
  const client = new ModbusRTU();
  try {
    await sim.start();
    await client.connectTCP('127.0.0.1', { port: newPort });
    client.setID(17);
    client.setTimeout(3000);
    const id = await client.readInputRegisters(1001, 1);
    assert.deepEqual(id.data, [17]);
    await client.writeRegister(5402, 2500);
    sim.tick();
    const power = await client.readInputRegisters(1370, 2);
    assert.deepEqual(power.data, [0, 22000]); // 110kW * 80% * 25%
  } finally {
    await new Promise(resolve => client.isOpen ? client.close(resolve) : resolve());
    await sim.stop();
  }
});

test('running Knox keeps the same TCP server when irradiance changes through API', async () => {
  const net = require('node:net');
  const { getStatus, getDevice, startDevice, stopDevice } = require('../src/simulator');
  const SimulatorController = require('../src/controllers/simulator.controller');
  const portProbe = net.createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));

  const sim = getDevice('knox');
  await stopDevice('knox');
  sim.configure({ host: '127.0.0.1', port, unitId: 3 });
  const res = { status: () => res, json: payload => payload };
  const controller = new SimulatorController(
    { getStatus, getDevice, getValues: () => [] },
    { save: async () => undefined },
    { findOne: async () => null },
  );
  try {
    await startDevice('knox');
    const listener = sim.server;
    assert.equal(sim.getStatus().state, 'RUNNING');
    await controller.updateDevice({
      validated: {
        params: { deviceKey: 'knox' },
        body: { options: { availabilityPct: 35 } },
      },
    }, res);
    assert.equal(sim.server, listener, 'live load changes must not restart port 502');
    assert.equal(sim.getStatus().state, 'RUNNING');
    sim.tick();
    assert.equal(sim.values.get('active_power').value, 38500);
  } finally {
    await stopDevice('knox');
    sim.configure({
      host: '0.0.0.0', port: 502, unitId: 3,
      options: { availabilityPct: 80, ratingKw: 110, loadKw: 100 },
    });
  }
});
