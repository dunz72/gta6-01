// Neon Bay — procedural WebAudio: every sound is synthesized, no audio files.
// Engine hum follows the car's speed, the siren wails when the police chase,
// gunshots and punches are noise bursts, pickups and missions get little jingles.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      // Resume only on a user gesture (unlock) or rarely: browsers log a
      // warning on every resume attempt while autoplay is blocked.
      if (this.ctx.state === 'suspended' && Date.now() - (this.lastResumeTry || 0) > 3000) {
        this.lastResumeTry = Date.now();
        this.ctx.resume().catch(() => {});
      }
      return this.ctx.state === 'running';
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch (_) {
      return false;
    }
  }

  unlock() {
    this.ensure();
    // A real user gesture: resume right away, regardless of the throttle.
    if (this.ctx && this.ctx.state === 'suspended') {
      this.lastResumeTry = Date.now();
      this.ctx.resume().catch(() => {});
    }
  }

  setEngine(speed01, on) {
    if (!this.ensure() || this.muted) { this.stopEngine(); return; }
    if (!on) { this.stopEngine(); return; }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const target = 0.05 + speed01 * 0.11;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
  }

  stopEngine() {
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch (_) {}
      this.engineOsc.disconnect();
      this.engineOsc = null;
      this.engineGain = null;
    }
  }

  setSiren(on) {
    if (!this.ensure() || this.muted || !on) {
      if (this.sirenOsc) {
        try { this.sirenOsc.stop(); } catch (_) {}
        this.sirenOsc.disconnect();
        this.sirenOsc = null;
        this.sirenGain = null;
      }
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.05;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    }
  }

  updateSiren(dt) {
    if (!this.sirenOsc || !this.ctx) return;
    this.sirenPhase += dt;
    const f = (Math.sin(this.sirenPhase * 4.4) > 0) ? 880 : 660;
    this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
  }

  noiseBurst(duration, volume, filterFreq) {
    if (!this.ensure() || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start();
  }

  blip(freq, duration, volume, type = 'sine') {
    if (!this.ensure() || this.muted) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain); gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  gunshot() { this.noiseBurst(0.16, 0.5, 2400); this.blip(140, 0.1, 0.25, 'square'); }
  punch() { this.noiseBurst(0.09, 0.35, 900); }
  pickup() { this.blip(880, 0.09, 0.25); setTimeout(() => this.blip(1318, 0.12, 0.25), 90); }
  missionJingle() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 0.28), i * 110));
  }
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 0.3, 'triangle'), i * 220)); }
  crash() { this.noiseBurst(0.3, 0.4, 500); }
}
