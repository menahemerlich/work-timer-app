const { net } = require("electron");

class NetworkMonitor {
  constructor({ onOnline, onOffline, pingFn, intervalMs = 30000 }) {
    this.onOnline = onOnline;
    this.onOffline = onOffline;
    this.pingFn = pingFn;
    this.intervalMs = intervalMs;
    this.isOnline = net.isOnline();
    this.interval = null;
  }

  start() {
    this.checkNow();

    this.interval = setInterval(() => {
      this.checkNow();
    }, this.intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async checkNow() {
    const browserOnline = net.isOnline();
    let reachable = false;

    if (browserOnline && this.pingFn) {
      reachable = await this.pingFn();
    }

    const nextOnline = browserOnline && reachable;
    const changed = nextOnline !== this.isOnline;
    this.isOnline = nextOnline;

    if (changed) {
      if (nextOnline) {
        this.onOnline?.();
      } else {
        this.onOffline?.();
      }
    }

    return this.isOnline;
  }
}

module.exports = { NetworkMonitor };
