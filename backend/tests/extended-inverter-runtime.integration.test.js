'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const ModbusRTU = require('modbus-serial');
const { EXTENDED_INVERTER_PROFILES } = require('../src/seed/extended-inverter-profiles');
const { SimulatorDevice, waitForServer } = require('../src/simulator/simulator-device');
const { buildSharedVector } = require('../src/simulator');
const { encodeRegister } = require('../src/modbus/register-encoder');

async function unusedTcpPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function closeClient(client) {
  return new Promise((resolve) => {
    try {
      client.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

test('six extended profiles serve real Modbus TCP reads and FC16 power-control writes', async () => {
  const port = await unusedTcpPort();
  const devices = EXTENDED_INVERTER_PROFILES.map((profile, index) => new SimulatorDevice({
    key: profile.identifier,
    deviceType: profile.name,
    profile,
    defaultConfiguration: {
      host: '127.0.0.1',
      port,
      unitId: index + 5,
      updateIntervalMs: 60000,
      options: { ratingKw: profile.metadata.simulator.ratingKw, availabilityPct: 80, loadKw: 100 },
    },
  }));
  const vector = buildSharedVector(devices);
  const server = new ModbusRTU.ServerTCP(vector, { host: '127.0.0.1', port, unitID: 255 });
  const client = new ModbusRTU();

  try {
    await waitForServer(server);
    devices.forEach((device) => device.attachSharedServer(server));
    await client.connectTCP('127.0.0.1', { port });

    for (let index = 0; index < devices.length; index += 1) {
      const device = devices[index];
      const profile = device.profile;
      const unitId = index + 5;
      client.setID(unitId);

      const holding = profile.registers.find(
        (register) => register.enabled !== false && register.registerType === 'HOLDING_REGISTER',
      );
      assert.ok(holding, profile.identifier + ' must expose a holding register');
      const holdingRead = await client.readHoldingRegisters(holding.address, holding.length);
      assert.equal(holdingRead.data.length, holding.length, profile.identifier + ' FC03 read');

      const input = profile.registers.find(
        (register) => register.enabled !== false && register.registerType === 'INPUT_REGISTER',
      );
      if (input) {
        const inputRead = await client.readInputRegisters(input.address, input.length);
        assert.equal(inputRead.data.length, input.length, profile.identifier + ' FC04 read');
      }

      const control = profile.registers.find(
        (register) => register.key === profile.metadata.simulator.powerControlKey,
      );
      assert.ok(control?.writable, profile.identifier + ' power control must be writable');
      const requested = profile.metadata.simulator.powerControlMode === 'absolute-watts' ? 5000 : 50;
      const encoded = encodeRegister(control, requested);
      await client.writeRegisters(control.address, encoded.rawValues);

      if (profile.metadata.simulator.powerControlMode === 'absolute-watts') {
        assert.equal(device.model.fixedPowerLimitKw, 5, profile.identifier + ' absolute power limit');
      } else {
        assert.equal(device.model.deratingPct, 50, profile.identifier + ' derating write');
      }
    }

    client.setID(255);
    await assert.rejects(
      client.readHoldingRegisters(devices[0].profile.registers.find(
        (register) => register.enabled !== false && register.registerType === 'HOLDING_REGISTER',
      ).address, 1),
      /exception|modbus/i,
      'unknown unit IDs must not be routed to a configured inverter',
    );
  } finally {
    await closeClient(client);
    await Promise.all(devices.map((device) => device.stop()));
    await closeServer(server);
  }
});
