'use strict';

const SimulatorDeviceSettings = require('../models/simulator-device-settings.model');

const { sqliteModel } = require('../storage/sqlite');

class SimulatorSettingsRepository {
  constructor(model = sqliteModel(SimulatorDeviceSettings)) {
    this.model = model;
  }

  async get(key) {
    return this.model.findOne({ key }).lean().exec();
  }

  async save(key, settings) {
    return this.model
      .findOneAndUpdate(
        { key },
        { $set: settings, $setOnInsert: { key } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();
  }
}

module.exports = SimulatorSettingsRepository;
