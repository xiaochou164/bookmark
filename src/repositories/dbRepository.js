class DbRepository {
  constructor({ store, normalizeDb }) {
    this.store = store;
    this.normalizeDb = normalizeDb;
  }

  async read() {
    const db = await this.store.read();
    return this.normalizeDb ? this.normalizeDb(db) : db;
  }

  async update(mutator) {
    return this.store.update(async (db) => {
      const normalized = this.normalizeDb ? this.normalizeDb(db) : db;
      const next = await mutator(normalized);
      return this.normalizeDb ? this.normalizeDb(next) : next;
    });
  }
}

module.exports = {
  DbRepository
};
