"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const ModbusRTU = require("modbus-serial");
const { createModbusServer } = require("../src/modbus/server");
const { SimulatorDevice } = require("../src/simulator/simulator-device");
const { EXTENDED_INVERTER_PROFILES } = require("../src/seed/extended-inverter-profiles");
const { encodeRegister } = require("../src/modbus/register-encoder");

const INPUT_REGISTER_PROFILE_IDS = new Set(["growatt-max", "esinv-33000id-hybrid"]);

test("six extended inverter profiles route FC03/FC04 reads and FC16 controls over TCP", async () => {
  const server = createModbusServer({ host: "127.0.0.1", port: 0, unitId: 255 });
  const devices = EXTENDED_INVERTER_PROFILES.map((profile, index) => new SimulatorDevice({
    profile,
    configuration: {
      unitId: index + 5,
      options: { ratingKw: profile.metadata.ratedPowerKw || 30, availabilityPct: 100, loadKw: 10 },
    },
  }));

  for (const device of devices) server.addDevice(device);
  await server.listen();
  const port = server.server.address().port;

  try {
    for (const [index, profile] of EXTENDED_INVERTER_PROFILES.entries()) {
      const unitId = index + 5;
      const device = devices[index];
      const client = new ModbusRTU();
      await client.connectTCP("127.0.0.1", { port, host: "127.0.0.1" });
      client.setID(unitId);
      client.setTimeout(1500);

      try {
        const holding = profile.registers.find((register) =>
          register.enabled !== false && register.registerType === "HOLDING_REGISTER"
        );
        assert.ok(holding, `${profile.id} has an FC03 register`);
        const holdingRead = await client.readHoldingRegisters(holding.address, holding.length);
        assert.equal(holdingRead.data.length, holding.length, `${profile.id} FC03 read length`);

        const stringRegister = profile.registers.find((register) =>
          register.enabled !== false && register.registerType === "HOLDING_REGISTER" && register.dataType === "STRING"
        );
        if (stringRegister) {
          const stringRead = await client.readHoldingRegisters(stringRegister.address, stringRegister.length);
          assert.equal(stringRead.data.length, stringRegister.length, `${profile.id} ASCII block FC03`);
        }

        const wideRegister = profile.registers.find((register) =>
          register.enabled !== false && register.registerType === "HOLDING_REGISTER" &&
          register.length > 1 && register.dataType !== "STRING"
        );
        if (wideRegister) {
          const wideRead = await client.readHoldingRegisters(wideRegister.address, wideRegister.length);
          assert.equal(wideRead.data.length, wideRegister.length, `${profile.id} multiword FC03`);
        }

        const input = profile.registers.find((register) =>
          register.enabled !== false && register.registerType === "INPUT_REGISTER"
        );
        assert.equal(Boolean(input), INPUT_REGISTER_PROFILE_IDS.has(profile.id), `${profile.id} manual FC04 coverage`);
        if (input) {
          const inputRead = await client.readInputRegisters(input.address, input.length);
          assert.equal(inputRead.data.length, input.length, `${profile.id} FC04 read length`);
        }

        const simulator = profile.metadata.simulator;
        const control = profile.registers.find((register) => register.key === simulator.powerControlKey);
        assert.ok(control?.writable, `${profile.id} has a writable power control`);
        const requested = simulator.powerControlMode === "absolute-watts" ? 5000 : 50;
        const encoded = encodeRegister(control, requested);
        await client.writeRegisters(control.address, encoded.rawValues);
        const controlReadback = await client.readHoldingRegisters(control.address, control.length);
        assert.deepEqual(controlReadback.data, encoded.rawValues, `${profile.id} FC16 power-control readback`);

        if (simulator.powerControlMode === "absolute-watts") {
          assert.equal(device.model.fixedPowerLimitKw, 5, `${profile.id} absolute-watt control`);
        } else {
          assert.equal(device.model.deratingPct, 50, `${profile.id} percentage control`);
        }

        if (simulator.powerControlEnableKey && simulator.powerControlEnableKey !== simulator.remoteOnOffKey) {
          const enable = profile.registers.find((register) => register.key === simulator.powerControlEnableKey);
          assert.ok(enable?.writable, `${profile.id} has a writable control-enable register`);
          const enableValue = simulator.powerControlEnableValue ?? 1;
          const enableEncoded = encodeRegister(enable, enableValue);
          await client.writeRegisters(enable.address, enableEncoded.rawValues);
          const enableReadback = await client.readHoldingRegisters(enable.address, enable.length);
          assert.deepEqual(enableReadback.data, enableEncoded.rawValues, `${profile.id} FC16 enable readback`);
          assert.equal(device.model.powerControlEnabled, true, `${profile.id} control enable`);
        }

        if (simulator.remoteOnOffKey) {
          const remote = profile.registers.find((register) => register.key === simulator.remoteOnOffKey);
          assert.ok(remote?.writable, `${profile.id} has a writable remote control`);
          const stopValue = simulator.remoteControlBits
            ? 1
            : simulator.remoteOnOffEncoding === "startup-shutdown"
              ? 0xde
              : 0;
          const stopEncoded = encodeRegister(remote, stopValue);
          await client.writeRegisters(remote.address, stopEncoded.rawValues);
          const remoteReadback = await client.readHoldingRegisters(remote.address, remote.length);
          assert.deepEqual(remoteReadback.data, stopEncoded.rawValues, `${profile.id} FC16 remote-stop readback`);
          assert.equal(device.model.remoteOn, false, `${profile.id} remote stop`);
        }
      } finally {
        client.close();
      }
    }

    const unknown = new ModbusRTU();
    await unknown.connectTCP("127.0.0.1", { port, host: "127.0.0.1" });
    unknown.setID(255);
    unknown.setTimeout(1000);
    try {
      await assert.rejects(unknown.readHoldingRegisters(0, 1));
    } finally {
      unknown.close();
    }
  } finally {
    for (const device of devices) device.stop();
    await server.close();
  }
});
