'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { EXTENDED_INVERTER_PROFILES } = require('../src/seed/extended-inverter-profiles');
const { encodeRegister } = require('../src/modbus/register-encoder');
const { createGenericInverterModel, computeGenericInverter } = require('../src/simulator/generic-inverter');

const byId = new Map(EXTENDED_INVERTER_PROFILES.map((profile) => [profile.identifier, profile]));
const get = (profile, address, registerType) => {
  const register = profile.registers.find((item) =>
    item.address === address && (!registerType || item.registerType === registerType)
  );
  assert.ok(register, profile.identifier + ' register ' + address + ' exists');
  return register;
};

test('manual register counts and FC03/FC04 partitions are reconciled', () => {
  const expected = {
    'sofar-110ktl': { count: 1906, holding: 1906, input: 0 },
    'growatt-max': { count: 1284, holding: 411, input: 873 },
    'deye-nitrox-50kw': { count: 254, holding: 254, input: 0 },
    'foxess-r-v-h3plus': { count: 559, holding: 559, input: 0 },
    'goodwe-hybrid': { count: 156, holding: 156, input: 0 },
    'esinv-33000id-hybrid': { count: 768, holding: 437, input: 331 },
  };

  assert.equal(byId.size, 6);
  for (const [identifier, counts] of Object.entries(expected)) {
    const profile = byId.get(identifier);
    assert.ok(profile, 'profile ' + identifier + ' exists');
    assert.equal(profile.registers.length, counts.count, identifier + ' register count');
    assert.equal(profile.metadata.registerCount, counts.count, identifier + ' metadata count');
    assert.equal(profile.registers.filter((r) => r.registerType === 'HOLDING_REGISTER').length, counts.holding);
    assert.equal(profile.registers.filter((r) => r.registerType === 'INPUT_REGISTER').length, counts.input);
  }
});

test('all catalogued registers carry explicit big-endian byte and word order', () => {
  for (const profile of EXTENDED_INVERTER_PROFILES) {
    for (const register of profile.registers) {
      assert.equal(register.byteOrder, 'BIG_ENDIAN', profile.identifier + ' ' + register.address + ' byte order');
      assert.equal(register.wordOrder, 'BIG_ENDIAN', profile.identifier + ' ' + register.address + ' word order');
    }
  }
});

test('SOFAR and Deye manual exclusions are explicit rather than guessed', () => {
  const sofar = byId.get('sofar-110ktl').metadata.notes;
  assert.match(sofar, /1,954 named rows/);
  assert.match(sofar, /Forty-seven named rows have no data type/);
  assert.match(sofar, /0x102F/);
  const deye = byId.get('deye-nitrox-50kw').metadata.notes;
  assert.match(deye, /120–149/);
  assert.match(deye, /no per-word type or semantic mapping/);
});

test('Growatt V1.13 current, voltage, timing and diagnostic scales are exact', () => {
  const growatt = byId.get('growatt-max');
  for (const address of [126, 128, 130, 132, 134, 136, 138, 140]) {
    const register = get(growatt, address, 'INPUT_REGISTER');
    assert.equal(register.scaleFactor, 0.1);
    assert.equal(register.unit, 'mA');
    assert.deepEqual(encodeRegister(register, 500).rawValues, [5000]);
  }
  for (const [address, scale, unit] of [
    [1560, 10, 'mV'], [1561, 10, 'mA'], [1563, 10, 'mA'],
    [3088, 0.1, 'mA'], [3089, 0.1, 'mA'], [3090, 0.1, 'mA'],
    [3091, 1, 'mA'], [3162, 1, 'mV'], [279, 1, 'ms'], [283, 1, 'ms'], [751, 1, 'mA'],
  ]) {
    const register = get(growatt, address, 'INPUT_REGISTER');
    assert.equal(register.scaleFactor, scale, 'Growatt ' + address + ' scale');
    assert.equal(register.unit, unit, 'Growatt ' + address + ' unit');
  }
});

test('Deye V1.34 apparent power, temperature offset and trip-time scales match the manual', () => {
  const deye = byId.get('deye-nitrox-50kw');
  for (const address of [84, 85]) {
    const register = get(deye, address);
    assert.equal(register.scaleFactor, 0.1);
    assert.equal(register.unit, 'VA');
  }
  for (const address of [90, 91]) {
    const register = get(deye, address);
    assert.equal(register.scaleFactor, 0.1);
    assert.equal(register.offset, -100);
    assert.equal(register.unit, '°C');
    assert.deepEqual(encodeRegister(register, 50.5).rawValues, [1505]);
  }
  for (let address = 308; address <= 319; address += 1) {
    const register = get(deye, address);
    assert.equal(register.scaleFactor, 10);
    assert.equal(register.unit, 'ms');
  }
});

test('FoxESS numeric units are split into scaleFactor and unit; ambiguous current rows stay disabled', () => {
  const foxess = byId.get('foxess-r-v-h3plus');
  for (const register of foxess.registers) {
    assert.equal(/^\d/.test(register.unit || ''), false, 'FoxESS ' + register.address + ' has no embedded unit multiplier');
  }
  assert.equal(get(foxess, 40984).unit, 'V');
  assert.equal(get(foxess, 40984).scaleFactor, 1);
  assert.equal(get(foxess, 40988).unit, 'V');
  assert.equal(get(foxess, 40988).scaleFactor, 0.1);
  assert.equal(get(foxess, 40989).unit, 'A');
  assert.equal(get(foxess, 40989).scaleFactor, 0.01);
  assert.equal(get(foxess, 41657).unit, 'kWh');
  assert.equal(get(foxess, 41657).scaleFactor, 0.1);
  assert.equal(get(foxess, 41687).unit, 'ratio');
  assert.equal(get(foxess, 41687).scaleFactor, 0.001);
  for (const address of [40985, 40987, 41001]) {
    const register = get(foxess, address);
    assert.equal(register.enabled, false);
    assert.equal(register.unit, undefined);
  }
  assert.match(foxess.metadata.notes, /ambiguous unit text '0 01A'/);
});

test('GoodWe V1.3 meter connection status words are present and read-only', () => {
  const goodwe = byId.get('goodwe-hybrid');
  for (const [address, key] of [[1437, 'b_meter_connect_status_059d'], [1438, 'meter_connect_status_059e']]) {
    const register = get(goodwe, address, 'HOLDING_REGISTER');
    assert.equal(register.key, key);
    assert.equal(register.dataType, 'UINT16');
    assert.equal(register.length, 1);
    assert.equal(register.writable, false);
    assert.equal(register.enabled, true);
  }
});

test('ESINV V3.4 scaling and SOC/SOH fractional engineering values round-trip', () => {
  const esinv = byId.get('esinv-33000id-hybrid');
  for (const address of [33043, 33046, 33093, 33096]) {
    const register = get(esinv, address);
    assert.equal(register.scaleFactor, 0.1);
    assert.equal(register.unit, '°C');
  }
  assert.equal(get(esinv, 33281).scaleFactor, 0.01);
  assert.equal(get(esinv, 33281).unit, 'ratio');
  assert.equal(get(esinv, 33507).scaleFactor, 1);
  assert.equal(get(esinv, 33507).unit, 'ms');
  for (const address of [34200, 34201, 34216, 34217]) {
    assert.equal(get(esinv, address).scaleFactor, 0.001);
    assert.equal(get(esinv, address).unit, 'ratio');
  }
  assert.equal(get(esinv, 34203).unit, 'A');
  assert.equal(get(esinv, 34203).scaleFactor, 0.1);
  assert.equal(get(esinv, 43077).scaleFactor, 1);
  assert.equal(get(esinv, 43077).unit, undefined);
  for (const address of [43074, 43125, 43126]) {
    assert.equal(get(esinv, address).scaleFactor, 100);
    assert.equal(get(esinv, address).unit, 'W');
  }
  assert.equal(get(esinv, 43673).scaleFactor, 1);
  assert.equal(get(esinv, 43673).unit, '%');
  assert.equal(get(esinv, 44126).scaleFactor, 0.01);
  assert.equal(get(esinv, 44126).unit, '%');
  assert.match(esinv.metadata.notes, /normalized to 0.1 A/);

  const model = createGenericInverterModel(esinv);
  const device = {
    profile: esinv,
    model,
    configuration: { options: { ratingKw: 33, availabilityPct: 100, loadKw: 20 }, updateIntervalMs: 1000 },
    controlValues: new Map(),
    state: 'RUNNING',
  };
  const values = computeGenericInverter(device);
  const soc = get(esinv, 34200);
  const soh = get(esinv, 34201);
  assert.equal(values[soc.key], 0.785);
  assert.equal(values[soh.key], 0.972);
  assert.deepEqual(encodeRegister(soc, values[soc.key]).rawValues, [785]);
  assert.deepEqual(encodeRegister(soh, values[soh.key]).rawValues, [972]);
});
