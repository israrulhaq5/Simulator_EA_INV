'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createRegisterProfileBodySchema } = require('../src/validators/register-profile.validator');
const { EXTENDED_INVERTER_PROFILES } = require('../src/seed/extended-inverter-profiles');
const { BUILTIN_PROFILES } = require('../src/seed/builtin-profiles');
const { simulatorDevices } = require('../src/simulator');

test('six extended inverter profiles are valid, unique and included in built-ins', () => {
  assert.equal(EXTENDED_INVERTER_PROFILES.length, 6);
  for (const profile of EXTENDED_INVERTER_PROFILES) {
    const parsed = createRegisterProfileBodySchema.parse(profile);
    assert.ok(parsed.registers.length > 0);
    assert.equal(new Set(parsed.registers.map((r) => r.key)).size, parsed.registers.length);
    const addresses = parsed.registers.map((r) => r.registerType + ':' + r.address);
    assert.equal(new Set(addresses).size, addresses.length, profile.identifier + ' register addresses must be unique');
    assert.ok(BUILTIN_PROFILES.some((item) => item.identifier === profile.identifier));
  }
});

test('all six extended inverter simulators use TCP port 502 and unique unit IDs', () => {
  const keys = ['sofar', 'growatt', 'deye', 'foxess', 'goodwe', 'esinv'];
  const units = keys.map((key) => simulatorDevices[key].configuration.unitId);
  assert.deepEqual(units, [5, 6, 7, 8, 9, 10]);
  assert.ok(keys.every((key) => simulatorDevices[key].configuration.port === 502));
  assert.ok(keys.every((key) => simulatorDevices[key].model.genericInverter === true));
});

test('extended inverter profiles have model-specific manuals and source attribution', () => {
  for (const profile of EXTENDED_INVERTER_PROFILES) {
    assert.match(profile.metadata.source, /^https:\/\/drive\.google\.com\//);
    assert.equal(profile.metadata.profileVersion, 1);
    assert.ok(profile.metadata.simulator.ratingKw > 0);
  }
});
