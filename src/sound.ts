/**
 * Procedural sound effects — every sound is synthesized live with
 * WebAudio oscillators and filtered noise (no audio assets). The
 * context unlocks on the first user gesture (mobile requirement).
 */

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;

  /** Call from any user-gesture handler; safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
      // 1s of white noise to slice bursts from
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    freq: number, endFreq: number, dur: number,
    type: OscillatorType, vol: number, delay = 0
  ): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, filterFreq: number, vol: number, delay = 0, hipass = false): void {
    if (!this.enabled || !this.ctx || !this.master || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = hipass ? 'highpass' : 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.02);
  }

  // ---------- game events ----------
  place(): void {
    this.tone(190, 150, 0.07, 'square', 0.12);
    this.noise(0.05, 1200, 0.06);
  }

  breakBlock(): void {
    this.noise(0.14, 750, 0.22);
    this.tone(95, 55, 0.12, 'sine', 0.2);
  }

  swing(): void {
    this.noise(0.09, 2600, 0.07, 0, true);
  }

  hitMob(): void {
    this.tone(290, 130, 0.09, 'sawtooth', 0.14);
    this.noise(0.06, 1800, 0.1);
  }

  hurt(): void {
    this.tone(150, 70, 0.22, 'sawtooth', 0.2);
  }

  eat(): void {
    this.tone(330, 260, 0.06, 'square', 0.1);
    this.tone(280, 220, 0.06, 'square', 0.1, 0.1);
  }

  tamed(): void {
    for (let i = 0; i < 3; i++) this.tone(440 * Math.pow(1.26, i), 440 * Math.pow(1.26, i), 0.12, 'sine', 0.12, i * 0.09);
  }

  ride(): void {
    this.noise(0.3, 900, 0.1);
    this.tone(180, 320, 0.25, 'sine', 0.08);
  }

  skill(): void {
    this.tone(620, 1240, 0.18, 'sine', 0.12);
    this.noise(0.12, 3200, 0.05, 0, true);
  }

  death(): void {
    this.tone(220, 50, 0.7, 'sawtooth', 0.18);
  }

  craft(): void {
    this.tone(500, 740, 0.09, 'triangle', 0.12);
  }

  click(): void {
    this.tone(640, 600, 0.04, 'sine', 0.08);
  }
}

export const sfx = new Sfx();
