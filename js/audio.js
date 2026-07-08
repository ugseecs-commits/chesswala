// --- CHESSOLOGY AUDIO ENGINE -----------------------------------------------
window.audio = {
  audioCtx: null,
  enabled: true,
  volume: 1.0,

  initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },

  playSynthSound(type) {
    if (!this.enabled) return;
    this.initAudio();
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    
    // Helper to calculate target gain based on master volume
    const vol = (v) => v * this.volume;
    
    try {
      if (type === 'move') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, this.audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(vol(0.2), this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(vol(0.001), this.audioCtx.currentTime + 0.08);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.08);
      } else if (type === 'capture') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(vol(0.25), this.audioCtx.currentTime);
        gain.gain.setValueAtTime(vol(0.08), this.audioCtx.currentTime + 0.02);
        gain.gain.setValueAtTime(vol(0.2), this.audioCtx.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(vol(0.001), this.audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.1);
      } else if (type === 'check') {
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(520, this.audioCtx.currentTime);
        osc2.frequency.setValueAtTime(650, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(vol(0.15), this.audioCtx.currentTime);
        gain.gain.setValueAtTime(vol(0.05), this.audioCtx.currentTime + 0.04);
        gain.gain.setValueAtTime(vol(0.12), this.audioCtx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(vol(0.001), this.audioCtx.currentTime + 0.2);
        osc1.start(); osc2.start();
        osc1.stop(this.audioCtx.currentTime + 0.2);
        osc2.stop(this.audioCtx.currentTime + 0.2);
      } else if (type === 'end') {
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach(f => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.type = 'sine';
          osc.frequency.value = f;
          gain.gain.setValueAtTime(vol(0.06), this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(vol(0.001), this.audioCtx.currentTime + 0.5);
          osc.start();
          osc.stop(this.audioCtx.currentTime + 0.5);
        });
      }
    } catch(e) {}
  },

  playSound(type) {
    if (!this.enabled) return;
    const url = window.SOUND_URLS && window.SOUND_URLS[type];
    let played = false;
    if (url) {
      if (!window.audioCache) window.audioCache = {};
      if (!window.audioCache[type]) {
        window.audioCache[type] = new Audio(url);
      }
      const audio = window.audioCache[type];
      
      // Handle volume mapping for HTML Audio element
      audio.volume = this.volume;
      audio.currentTime = 0;
      
      const playPromise = audio.play();
      const timeout = setTimeout(() => {
        if (!played) {
          this.playSynthSound(type);
        }
      }, 100);
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          played = true;
          clearTimeout(timeout);
        }).catch(() => {
          if (!played) {
            this.playSynthSound(type);
            played = true;
            clearTimeout(timeout);
          }
        });
      }
    } else {
      this.playSynthSound(type);
    }
  }
};
