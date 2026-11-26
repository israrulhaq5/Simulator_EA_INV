'use strict';
const { sqliteModel } = require('../storage/sqlite');

class BaseRepository {
  constructor(model) { this.model = sqliteModel(model); }
  applyPopulate(query, populate) {
    if (populate) query.populate(populate);
    return query;
  }
  async findById(id, { populate } = {}) {
    return this.applyPopulate(this.model.findById(id), populate).lean().exec();
  }
  async findOne(filter, { populate } = {}) {
    return this.applyPopulate(this.model.findOne(filter), populate).lean().exec();
  }
  async create(payload, { populate } = {}) {
    const created = await this.model.create(payload);
    return populate ? this.findById(created._id, { populate }) : created;
  }
  async updateById(id, payload, { populate } = {}) {
    return this.applyPopulate(this.model.findByIdAndUpdate(id, { $set: payload }, { new: true }), populate).lean().exec();
  }
  async deleteById(id) { return this.model.findByIdAndDelete(id).exec(); }
  async countDocuments(filter = {}) { return this.model.countDocuments(filter).exec(); }
}
module.exports = BaseRepository;
