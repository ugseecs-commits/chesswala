// --- CHESSOLOGY TIMER LOGIC ------------------------------------------------
const TIMER_TIMING = {
  CLOCK_TICK_MS: 100,
  CLOCK_SYNC_INTERVAL_MS: 3000,
  TENTHS_THRESHOLD_MS: 10000
};

window.timer = {
  active: false,
  enabled: false,
  whiteTime: 0,
  blackTime: 0,
  whiteInc: 0,
  blackInc: 0,
  lastTick: 0,
  interval: null,
  syncInterval: null,
  activeSide: 'w',

  init(wTimeSec, bTimeSec, wIncSec, bIncSec) {
    if (wTimeSec === 0 && bTimeSec === 0) {
      this.enabled = false;
      this.active = false;
      this.render();
      return;
    }
    this.enabled = true;
    this.whiteTime = wTimeSec * 1000;
    this.blackTime = bTimeSec * 1000;
    this.whiteInc = wIncSec * 1000;
    this.blackInc = bIncSec * 1000;
    this.active = false;
    this.stop();
    this.render();
  },

  start(side) {
    if (!this.enabled || (window.app && window.app.over)) return;
    this.activeSide = side;
    this.active = true;
    this.lastTick = Date.now();
    if (!this.interval) {
      this.interval = setInterval(() => this.tick(), TIMER_TIMING.CLOCK_TICK_MS);
    }
    if (window.webrtc && window.webrtc.active && !window.webrtc.isHost) {
      this.startSyncInterval();
    }
  },

  startSyncInterval() {
    if (this.syncInterval) return;
    this.syncInterval = setInterval(() => this.requestSync(), TIMER_TIMING.CLOCK_SYNC_INTERVAL_MS);
  },

  switchTurn(newSide) {
    if (!this.enabled || !this.active) return;
    // Add increment to the player who just moved
    if (this.activeSide === 'w') {
      this.whiteTime += this.whiteInc;
    } else {
      this.blackTime += this.blackInc;
    }
    this.activeSide = newSide;
    this.lastTick = Date.now();
    this.render();
  },

  stop() {
    this.active = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  },

  tick() {
    if (!this.active) return;
    const now = Date.now();
    const deltaTime = now - this.lastTick;
    this.lastTick = now;

    if (this.activeSide === 'w') {
      this.whiteTime = Math.max(0, this.whiteTime - deltaTime);
      if (this.whiteTime === 0) { this.timeOut('w'); return; }
    } else {
      this.blackTime = Math.max(0, this.blackTime - deltaTime);
      if (this.blackTime === 0) { this.timeOut('b'); return; }
    }
    this.render();
  },

  timeOut(color) {
    this.stop();
    if (window.app && window.app.handleTimeOut) {
      window.app.handleTimeOut(color);
    }
  },

  format(ms) {
    if (!this.enabled) return "";
    const totalSec = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    // We only show tenths of a second when a player is in severe time trouble (under 20s).
    // Otherwise, the constantly flashing milliseconds just induce unnecessary panic.
    if (ms > 0 && ms < TIMER_TIMING.TENTHS_THRESHOLD_MS) {
      const tenths = Math.floor((ms % 1000) / 100);
      return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  },

  render() {
    const whiteClockElement = document.getElementById('clockW');
    const blackClockElement = document.getElementById('clockB');
    if (whiteClockElement) {
      whiteClockElement.textContent = this.format(this.whiteTime);
      whiteClockElement.style.display = this.enabled ? 'block' : 'none';
      if (this.enabled && this.active && this.activeSide === 'w') {
        whiteClockElement.classList.add('clock-active');
      } else {
        whiteClockElement.classList.remove('clock-active');
      }
    }
    if (blackClockElement) {
      blackClockElement.textContent = this.format(this.blackTime);
      blackClockElement.style.display = this.enabled ? 'block' : 'none';
      if (this.enabled && this.active && this.activeSide === 'b') {
        blackClockElement.classList.add('clock-active');
      } else {
        blackClockElement.classList.remove('clock-active');
      }
    }
  },

  requestSync() {
    if (window.webrtc && window.webrtc.active) {
      window.webrtc.sendData({
        type: 'request-clock-sync',
        requestTimestamp: Date.now()
      });
    }
  },

  handleSyncResponse(data, latency) {
    this.whiteTime = data.whiteTime;
    this.blackTime = data.blackTime;
    // Adjust active player'seconds clock by the latency
    if (data.activeSide === 'w') {
      this.whiteTime = Math.max(0, this.whiteTime - latency);
    } else {
      this.blackTime = Math.max(0, this.blackTime - latency);
    }
    this.activeSide = data.activeSide;
    this.lastTick = Date.now();
    this.render();
  }
};
