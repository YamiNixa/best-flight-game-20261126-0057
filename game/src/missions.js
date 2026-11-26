// Harbor Run — missions: three sorties with different goals.
// Ring Run threads the glowing rings, Harbour Circuit races the gates,
// Landing Challenge scores one greased arrival. Fuel and damage are the
// decisions that run through all three.

import { CONFIG } from './config.js';
import { dist3, headingDegrees } from './world.js';

const RING_SCORE = CONFIG.score.ring;
const GATE_SCORE = CONFIG.score.gate;

export class Missions {
  constructor() {
    this.kind = 'rings';       // 'rings' | 'circuit' | 'landing'
    this.score = 0;
    this.elapsed = 0;
    this.started = false;
    this.finished = false;
    this.success = false;
    this.ringsDone = 0;
    this.gatesDone = 0;
    this.lap = 1;
    this.landingReport = null;
    this.bestTime = null;
    this.lapTimes = [];
  }

  start(kind) {
    this.kind = kind;
    this.score = 0;
    this.elapsed = 0;
    this.started = true;
    this.finished = false;
    this.success = false;
    this.ringsDone = 0;
    this.gatesDone = 0;
    this.lap = 1;
    this.landingReport = null;
    this.lapTimes = [];
  }

  get name() {
    return this.kind === 'rings' ? 'RING RUN'
      : this.kind === 'circuit' ? 'HARBOUR CIRCUIT' : 'LANDING CHALLENGE';
  }

  // The next target the pilot should fly to, or null.
  nextTarget() {
    if (this.kind === 'rings') {
      if (this.ringsDone >= CONFIG.rings.length) return null;
      return { ...CONFIG.rings[this.ringsDone], kind: 'ring' };
    }
    if (this.kind === 'circuit') {
      if (this.finished) return null;
      const idx = this.gatesDone % CONFIG.circuitGates.length;
      return { ...CONFIG.circuitGates[idx], kind: 'gate' };
    }
    return null; // landing: the runway is the target
  }

  // Targets the renderer should draw: upcoming ones, dimming the passed.
  visibleTargets() {
    const out = [];
    if (this.kind === 'rings') {
      CONFIG.rings.forEach((r, i) => {
        const next = i === this.ringsDone;
        const prev = i > 0 ? CONFIG.rings[i - 1] : null;
        const from = prev || { x: -900, y: 120, z: 620 };
        const nx = r.x - from.x, nz = r.z - from.z;
        const len = Math.hypot(nx, nz) || 1;
        out.push({
          ...r,
          label: `RING ${i + 1}/${CONFIG.rings.length}`,
          next,
          done: i < this.ringsDone,
          normal: { x: nx / len, z: nz / len },
          distance: 0,
        });
      });
    } else if (this.kind === 'circuit') {
      CONFIG.circuitGates.forEach((g, i) => {
        const idx = this.gatesDone % CONFIG.circuitGates.length;
        const next = i === idx && !this.finished;
        out.push({
          ...g,
          label: `GATE ${i + 1} · LAP ${this.lap}/${CONFIG.circuitLaps}`,
          next,
          done: false,
          normal: { x: 0, z: -1 },
          distance: 0,
        });
      });
    }
    return out;
  }

  // Called every tick while flying. Returns an event for the main loop.
  update(dt, flight, prevPos) {
    if (!this.started || this.finished) return null;
    this.elapsed += dt;
    const target = this.nextTarget();
    if (target && flight.ringPassed(prevPos, target)) {
      if (this.kind === 'rings') {
        this.ringsDone++;
        this.score += RING_SCORE;
        if (this.ringsDone >= CONFIG.rings.length) {
          return { type: 'ringsComplete' };
        }
        return { type: 'ring', n: this.ringsDone, total: CONFIG.rings.length };
      }
      // Circuit gate.
      this.gatesDone++;
      this.score += GATE_SCORE;
      if (this.gatesDone % CONFIG.circuitGates.length === 0) {
        this.lapTimes.push(this.elapsed);
        if (this.lap >= CONFIG.circuitLaps) {
          this.finish(true);
          return { type: 'circuitComplete' };
        }
        this.lap++;
      }
      return { type: 'gate', n: this.gatesDone };
    }
    return null;
  }

  // Called when the plane touches down (or crashes).
  onTouchdown(flight, crashed) {
    if (!this.started || this.finished) return null;
    const td = flight.lastTouchdown;
    if (crashed) {
      this.finish(false);
      return { type: 'crash' };
    }
    if (this.kind === 'landing') {
      const smooth = td.vs < 2.5 && td.speed < 34 && td.onRunway;
      const score = CONFIG.score.landing
        + (smooth ? CONFIG.score.smoothLandingBonus : 0)
        + (td.onRunway ? 0 : -100);
      this.score += Math.max(0, score);
      this.landingReport = {
        vs: td.vs, speed: td.speed, onRunway: td.onRunway,
        aligned: td.aligned, smooth,
      };
      this.finish(td.onRunway);
      return { type: 'landing', smooth, onRunway: td.onRunway };
    }
    if (this.kind === 'rings') {
      // Landing after the rings: the sortie bonus.
      const bonus = CONFIG.score.landing
        + (td.onRunway ? 100 : 0)
        + (td.vs < 2.5 ? CONFIG.score.smoothLandingBonus : 0);
      this.score += Math.max(0, bonus);
      const timeBonus = Math.max(0, Math.round((360 - this.elapsed) * CONFIG.score.timeBonusPerSecond));
      this.score += timeBonus;
      this.landingReport = { vs: td.vs, speed: td.speed, onRunway: td.onRunway, aligned: td.aligned, smooth: td.vs < 2.5, timeBonus };
      this.finish(true);
      return { type: 'landing', smooth: td.vs < 2.5, onRunway: td.onRunway };
    }
    // Circuit: landing ends the run early, keeps gate points.
    this.finish(false);
    return { type: 'landing', smooth: td.vs < 2.5, onRunway: td.onRunway };
  }

  finish(success) {
    this.finished = true;
    this.success = success;
    if (success && !this.bestTime) this.bestTime = this.elapsed;
  }

  objectiveText() {
    if (!this.started) return 'Pick a mission';
    if (this.finished) return this.success ? 'MISSION COMPLETE' : 'SORTIE OVER';
    if (this.kind === 'rings') {
      if (this.ringsDone >= CONFIG.rings.length) {
        return 'All rings flown — land on the runway!';
      }
      return `RING ${this.ringsDone + 1}/${CONFIG.rings.length} — then land on the runway`;
    }
    if (this.kind === 'circuit') {
      return `LAP ${this.lap}/${CONFIG.circuitLaps} — GATE ${(this.gatesDone % CONFIG.circuitGates.length) + 1}/${CONFIG.circuitGates.length}`;
    }
    return 'Land on the runway — slow, level, on the centreline';
  }

  timerText() {
    const t = this.elapsed;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  resultTitle() {
    if (this.kind === 'landing' && this.success) return 'GREASED IT!';
    if (this.success) return 'MISSION COMPLETE';
    if (this.kind === 'circuit') return 'RUN ENDED';
    return 'SORTIE OVER';
  }

  resultLines() {
    const lines = [];
    if (this.kind === 'rings') {
      lines.push(`Rings flown: ${this.ringsDone} / ${CONFIG.rings.length}`);
    }
    if (this.kind === 'circuit') {
      lines.push(`Gates passed: ${this.gatesDone}  •  Laps: ${Math.min(this.lap, CONFIG.circuitLaps)} / ${CONFIG.circuitLaps}`);
      lines.push(`Time: ${this.timerText()}`);
    }
    if (this.landingReport) {
      const r = this.landingReport;
      lines.push(`Touchdown: ${r.vs.toFixed(1)} m/s down, ${Math.round(r.speed * 3.6)} km/h, ${r.onRunway ? 'on the runway' : 'off the runway'}`);
      if (r.timeBonus) lines.push(`Time bonus: +${r.timeBonus}`);
      if (r.smooth) lines.push('Smooth landing — nice flying.');
    }
    return lines;
  }

  // Distance and bearing to the next target, for the HUD arrow.
  navTo(flight) {
    const t = this.nextTarget();
    if (!t) {
      const r = CONFIG.world.runway;
      return { distance: dist3(flight.position, { x: r.x, y: 2, z: r.z }), label: 'RUNWAY', bearing: 0 };
    }
    const d = dist3(flight.position, t);
    const bearing = Math.atan2(t.x - flight.x, -(t.z - flight.z));
    return { distance: d, label: t.kind === 'ring' ? 'RING' : 'GATE', bearing };
  }
}
