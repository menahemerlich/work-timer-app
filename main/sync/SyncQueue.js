class SyncQueue {
  constructor(localDb) {
    this.localDb = localDb;
  }

  static ENTITY_ORDER = {
    employer: 0,
    app_settings: 1,
    work_log: 2,
    timer_state: 3
  };

  getPending() {
    const items = this.localDb.getPendingSyncItems();
    return items.sort((a, b) => {
      const orderA = SyncQueue.ENTITY_ORDER[a.entity_type] ?? 9;
      const orderB = SyncQueue.ENTITY_ORDER[b.entity_type] ?? 9;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.id - b.id;
    });
  }

  getPendingCount() {
    return this.localDb.getPendingSyncCount();
  }

  markSynced(id) {
    this.localDb.markSyncItemSynced(id);
  }

  markFailed(id, error) {
    this.localDb.markSyncItemFailed(id, error);
  }
}

module.exports = { SyncQueue };
