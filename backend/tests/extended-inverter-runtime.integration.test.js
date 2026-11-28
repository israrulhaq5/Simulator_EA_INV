'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const ModbusRTU = require('modbus-serial');
const { EXTENDED_INVERTER_PROFILES } = require('../src/seed/extended-inverter-profiles');
const { SimulatorDevice, waitForServer } = require('../src/simulator/simulator-device');
const { buildSharedVector } = require('../src/simulator');
const { encodeRegister } = require('../src/modbus/register-encoder');

const INPUT_REGISTER_PROFILE_IDS = new Set(['growatt-max', 'esinv-33000id-hybrid']);

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

test('six extended profiles route FC03/FC04 reads and FC16 control writes over TCP', async () => {
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
      const simulator = profile.metadata.simulator;
      const unitId = index + 5;
      client.setID(unitId);

      const holding = profile.registers.find(
        (register) => register.enabled !== false && register.registerType === 'HOLDING_REGISTER',
      );
      assert.ok(holding, profile.identifier + ' must expose an FC03 register');
      const holdingRead = await client.readHoldingRegisters(holding.address, holding.length);
      assert.equal(holdingRead.data.length, holding.length, profile.identifier + ' FC03 read');

      const stringRegister = profile.registers.find(
        (register) => register.enabled !== false && register.registerType === 'HOLDING_REGISTER' && register.dataType === 'STRING',
      );
      if (stringRegister) {
        const stringRead = await client.readHoldingRegisters(stringRegister.address, stringRegister.length);
        assert.equal(stringRead.data.length, stringRegister.length, profile.identifier + ' ASCII FC03 read');
      }

      const wideRegister = profile.registers.find(
        (register) => register.enabled !== false && register.registerType === 'HOLDING_REGISTER' &&
          register.length > 1 && register.dataType !== 'STRING',
      );
      if (wideRegister) {
        const wideRead = await client.readHoldingRegisters(wideRegister.address, wideRegister.length);
        assert.equal(wideRead.data.length, wideRegister.length, profile.identifier + ' multiword FC03 read');
      }

      const input = profile.registers.find(
        (register) => register.enabled !== false && register.registerType === 'INPUT_REGISTER',
      );
      assert.equal(Boolean(input), INPUT_REGISTER_PROFILE_IDS.has(profile.identifier), profile.identifier + ' manual FC04 coverage');
      if (input) {
        const inputRead = await client.readInputRegisters(input.address, input.length);
        assert.equal(inputRead.data.length, input.length, profile.identifier + ' FC04 read');
      }

      const control = profile.registers.find((register) => register.key === simulator.powerControlKey);
      assert.ok(control?.writable, profile.identifier + ' power control must be writable');
      const requested = simulator.powerControlMode === 'absolute-watts' ? 5000 : 50;
      const encoded = encodeRegister(control, requested);
      await client.writeRegisters(control.address, encoded.rawValues);
      const controlReadback = await client.readHoldingRegisters(control.address, control.length);
      assert.deepEqual(controlReadback.data, encoded.rawValues, profile.identifier + ' FC16 control readback');

      if (simulator.powerControlMode === 'absolute-watts') {
        assert.equal(device.model.fixedPowerLimitKw, 5, profile.identifier + ' absolute power limit');
      } else {
        assert.equal(device.model.deratingPct, 50, profile.identifier + ' derating write');
      }

      if (simulator.powerControlEnableKey && simulator.powerControlEnableKey !== simulator.remoteOnOffKey) {
        const enable = profile.registers.find((register) => register.key === simulator.powerControlEnableKey);
        assert.ok(enable?.writable, profile.identifier + ' control enable must be writable');
        const enableValue = simulator.powerControlEnableValue ?? 1;
        const enableEncoded = encodeRegister(enable, enableValue);
        await client.writeRegisters(enable.address, enableEncoded.rawValues);
        const enableReadback = await client.readHoldingRegisters(enable.address, enable.length);
        assert.deepEqual(enableReadback.data, enableEncoded.rawValues, profile.identifier + ' FC16 enable readback');
        assert.equal(device.model.powerControlEnabled, true, profile.identifier + ' control enable');
      }

      if (simulator.remoteOnOffKey) {
        const remote = profile.registers.find((register) => register.key === simulator.remoteOnOffKey);
        assert.ok(remote?.writable, profile.identifier + ' remote control must be writable');
        const stopValue = simulator.remoteControlBits
          ? 1
          : simulator.remoteOnOffEncoding === 'startup-shutdown'
            ? 0xde
            : 0;
        const stopEncoded = encodeRegister(remote, stopValue);
        await client.writeRegisters(remote.address, stopEncoded.rawValues);
        const remoteReadback = await client.readHoldingRegisters(remote.address, remote.length);
        assert.deepEqual(remoteReadback.data, stopEncoded.rawValues, profile.identifier + ' FC16 remote-stop readback');
        assert.equal(device.model.remoteOn, false, profile.identifier + ' remote stop');
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
