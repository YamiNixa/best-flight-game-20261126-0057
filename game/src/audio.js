// Harbor Run — audio: every sound is synthesised with WebAudio.
// No audio files, no network: an engine hum that follows the throttle,
// wind that rises with speed, a chime for rings and a thud for touchdowns.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.started = false;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.startEngine();
    this.startWind();
    this.started = true;
  }

  startEngine() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 27.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(g2);
    g2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  startWind() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    src.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(ctx.destination);
    src.start();
  }

  // Called every tick with the live flight state.
  update(flight, flying) {
    if (!this.ctx || this.muted) {
      if (this.engineGain) this.engineGain.gain.value = 0;
      if (this.windGain) this.windGain.gain.value = 0;
      return;
    }
    const t = this.ctx.currentTime;
    const rpm = 42 + flight.throttle * 68 + flight.speed * 0.25;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm / 2, t, 0.08);
    this.engineGain.gain.setTargetAtTime(flying ? 0.05 + flight.throttle * 0.06 : 0.0, t, 0.1);
    const wind = Math.min(1, flight.speed / 72);
    this.windGain.gain.setTargetAtTime(flying ? wind * wind * 0.12 : 0, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + wind * 900, t, 0.15);
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.05);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0, t, 0.05);
  }

  // A bright two-note chime when a ring or gate is passed.
  chime() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    [880, 1318.5].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const start = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.22, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start(start); o.stop(start + 0.55);
    });
  }

  // A low thud for touchdowns and a crunch for crashes.
  thud(hard) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(hard ? 90 : 70, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(34, ctx.currentTime + 0.22);
    g.gain.setValueAtTime(hard ? 0.5 : 0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.32);
  }

  // A short fanfare when a mission is completed.
  fanfare() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      const start = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.2, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
      o.connect(g); g.connect(ctx.destination);
      o.start(start); o.stop(start + 0.65);
    });
  }
}
