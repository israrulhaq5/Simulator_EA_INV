'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const storage = require('../src/storage/sqlite');
const DeviceRepository = require('../src/repositories/device.repository');
const RegisterProfileRepository = require('../src/repositories/register-profile.repository');
const { seedBuiltinProfiles } = require('../src/seed/builtin-profiles');
const SimulatorSettingsRepository = require('../src/repositories/simulator-settings.repository');
const { GatewayConfigurationRepository } = require('../src/repositories/gateway-configuration.repository');
const { ZeroExportConfigurationRepository } = require('../src/repositories/zero-export-configuration.repository');

test('SQLite seeds, validates, persists and atomically claims polling leases', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'zero-export-sqlite-'));
  const file = path.join(dir, 'test.sqlite');
  try {
    storage.open(file);
    const profiles = new RegisterProfileRepository();
    await seedBuiltinProfiles(profiles);
    const profile = (await profiles.findAllForExport())[0];
    assert.ok(profile);
    const devices = new DeviceRepository();
    const payload = { identifier: 'test-meter', name: 'Test Meter', connection: { protocol: 'TCP', host: '127.0.0.1' }, registerProfile: profile._id, nextPollAt: new Date(0) };
    const device = await devices.createWithProfile(payload);
    assert.equal(device.registerProfile._id, profile._id);
    await assert.rejects(devices.create(payload), error => error.code === 11000);
    const now = new Date();
    const [a,b] = await Promise.all(['a','b'].map(leaseId => devices.claimNextDueForPolling({ now, leaseId, leaseMs: 60000 })));
    assert.equal([a,b].filter(Boolean).length, 1);
    const lease = a || b;
    await devices.recordPollSuccess(device._id, lease.pollLeaseId, { durationMs: 3, nextPollAt: new Date(now.getTime()+60000) });
    const settings = new SimulatorSettingsRepository();
    await settings.save('em500', { port: 15020, unitId: 1 });
    const gateway = new GatewayConfigurationRepository();
    await gateway.save(await gateway.getOrDefault());
    const zero = new ZeroExportConfigurationRepository();
    await zero.save(await zero.getOrDefault());
    await storage.close();
    storage.open(file);
    assert.equal((await devices.findById(device._id)).statistics.successfulPolls, 1);
    assert.equal((await settings.get('em500')).port, 15020);
    assert.equal((await gateway.get()).enabled, false);
    assert.equal((await zero.get()).enabled, false);
  } finally {
    await storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
