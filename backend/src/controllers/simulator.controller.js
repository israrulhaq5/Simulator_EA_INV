'use strict';

const {
  getDevice,
  getStatus,
  getValues,
  startDevice,
  stopDevice,
} = require('../simulator');
const SimulatorSettingsRepository = require('../repositories/simulator-settings.repository');
const DeviceRepository = require('../repositories/device.repository');
const { sendSuccess } = require('../utils/api-response');
const AppError = require('../utils/app-error');
const HTTP_STATUS = require('../constants/http-status');
const ERROR_CODES = require('../constants/error-codes');

class SimulatorController {
  constructor(
    runtime = { getStatus, getValues, getDevice },
    settingsRepository = new SimulatorSettingsRepository(),
    deviceRepository = new DeviceRepository(),
  ) {
    this.runtime = runtime;
    this.settingsRepository = settingsRepository;
    this.deviceRepository = deviceRepository;
    this.get = this.get.bind(this);
    this.getValues = this.getValues.bind(this);
    this.updateDevice = this.updateDevice.bind(this);
    this.startDevice = this.startDevice.bind(this);
    this.stopDevice = this.stopDevice.bind(this);
  }

  async get(_req, res) {
    return sendSuccess(res, { data: this.runtime.getStatus() });
  }

  async getValues(req, res) {
    const deviceKey = req.validated.query.device;
    return sendSuccess(res, {
      data: this.runtime.getValues(deviceKey),
      meta: { device: deviceKey },
    });
  }

  async updateDevice(req, res) {
    const deviceKey = req.validated.params.deviceKey;
    const body = req.validated.body;
    const device = this.runtime.getDevice(deviceKey);
    const previous = device.getStatus();
    const previousSettings = {
      host: previous.host,
      port: previous.port,
      unitId: previous.unitId,
      updateIntervalMs: previous.updateIntervalMs,
      options: { ...previous.options },
    };
    const desired = {
      ...previousSettings,
      ...body,
      options: { ...previousSettings.options, ...(body.options || {}) },
    };

    // Validate port/unit collisions without shutting down a working TCP
    // simulator first. A stopped simulator still reserves its configured ID.
    const otherDevices = this.runtime.getStatus().devices || {};
    const conflict = Object.entries(otherDevices).find(
      ([key, candidate]) =>
        key !== deviceKey &&
        candidate.host === desired.host &&
        candidate.port === desired.port &&
        candidate.unitId === desired.unitId,
    );
    if (conflict) {
      throw new AppError(
        `Port ${desired.port} / Unit ID ${desired.unitId} is already assigned to ${conflict[0]}.`,
        {
          statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
          code: ERROR_CODES.VALIDATION_ERROR,
          details: [{ field: 'unitId', message: 'Duplicate Modbus port/unit ID.' }],
        },
      );
    }

    // A save that fails must not appear successful or change live state.
    await this.settingsRepository.save(deviceKey, desired);

    const wasRunning = previous.state === 'RUNNING';
    const requiresRestart = ['host', 'port', 'unitId', 'updateIntervalMs'].some(
      (key) => desired[key] !== previousSettings[key],
    );
    try {
      if (requiresRestart) {
        await stopDevice(deviceKey);
        device.configure(body);
        if (wasRunning) await startDevice(deviceKey);
      } else {
        // Options-only changes are live: don't close port 502 or break a
        // zero-export controller currently polling the inverter.
        device.configure({ options: body.options || {} });
      }
    } catch (error) {
      // Restore the last known-good listener/configuration and saved settings.
      // Preserve the root failure if recovery also fails.
      try {
        await stopDevice(deviceKey);
        device.configure(previousSettings);
        await this.settingsRepository.save(deviceKey, previousSettings);
        if (wasRunning) await startDevice(deviceKey);
      } catch (recoveryError) {
        error.message += ` (rollback failed: ${recoveryError.message})`;
      }
      throw error;
    }

    // Keep the linked EMS polling device aligned with the editable server.
    // Do not silently claim synchronization when the database update fails.
    let syncedDevice = null;
    const linked = await this.deviceRepository.findOne({
      identifier: `${deviceKey}-simulator`,
    });
    if (linked) {
      const patch = {};
      if (body.unitId !== undefined) patch.unitId = desired.unitId;
      if (body.port !== undefined) {
        patch.connection = {
          protocol: linked.connection?.protocol || 'TCP',
          host: linked.connection?.host || '127.0.0.1',
          port: desired.port,
        };
      }
      if (Object.keys(patch).length > 0) {
        const updated = await this.deviceRepository.updateById(linked._id, patch);
        if (!updated) {
          throw new AppError(
            `Simulator settings saved but linked EMS device ${deviceKey}-simulator could not be synchronized.`,
            { statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR, code: ERROR_CODES.INTERNAL_ERROR },
          );
        }
        syncedDevice = { _id: String(updated._id), identifier: updated.identifier };
      }
    }

    return sendSuccess(res, {
      data: device.getStatus(),
      meta: { syncedDevice },
    });
  }

  async startDevice(req, res) {
    const deviceKey = req.validated.params.deviceKey;
    await startDevice(deviceKey);
    const device = this.runtime.getDevice(deviceKey);
    return sendSuccess(res, { data: device.getStatus() });
  }

  async stopDevice(req, res) {
    const deviceKey = req.validated.params.deviceKey;
    await stopDevice(deviceKey);
    const device = this.runtime.getDevice(deviceKey);
    return sendSuccess(res, { data: device.getStatus() });
  }
}

module.exports = SimulatorController;
