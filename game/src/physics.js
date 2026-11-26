// Harbor Run — flight physics: an arcade model with real trade-offs.
// Throttle buys speed, speed buys lift, banking turns the plane, and
// every hard arrival is paid for in fuel or airframe damage.

import { CONFIG } from './config.js';
import { groundHeightAt, onRunway, isSea, dist3, buildings } from './world.js';

const PL = CONFIG.plane;
const DMG = CONFIG.damage;

export class Flight {
  constructor() {
    this.reset(CONFIG.startPosition);
  }

  reset(spawn) {
    this.x = spawn.x;
    this.y = spawn.y;
    this.z = spawn.z;
    this.heading = (spawn.heading * Math.PI) / 180; // 0 = north (-z)
    this.pitch = 0;    // rad, + = nose up
    this.roll = 0;     // rad, + = bank right
    this.speed = spawn.speed || 0;
    this.throttle = 0.55;
    this.fuel = CONFIG.startFuel;
    this.damage = 0;
    this.verticalSpeed = 0;
    this.grounded = false;
    this.airborne = true;
    this.crashed = false;
    this.landed = false;
    this.lastTouchdown = null; // { vs, speed, onRunway, aligned }
    this.time = 0;
  }

  get position() { return { x: this.x, y: this.y, z: this.z }; }

  // One fixed tick. steer = { pitch: -1..1, roll: -1..1, rudder: -1..1 }.
  // Returns an event object: { hit: 'ring'|'ground'|'water'|'building'|null }.
  step(dt, steer, mission) {
    if (this.crashed || this.landed) return { hit: null };
    this.time += dt;

    // --- Throttle and fuel -------------------------------------------------
    this.throttle = Math.max(0, Math.min(1, this.throttle + steer.throttleDelta));
    if (this.fuel <= 0) this.throttle = 0;
    this.fuel = Math.max(0, this.fuel - CONFIG.fuel.drainPerSecond * this.throttle * dt);

    // --- Speed: throttle pulls towards its target, drag pulls back --------
    const targetSpeed = this.throttle * PL.maxSpeed;
    const accel = targetSpeed > this.speed ? PL.accel : PL.accel * 0.55;
    this.speed += Math.max(-accel * dt, Math.min(accel * dt, targetSpeed - this.speed));
    this.speed = Math.max(0, this.speed - PL.drag * this.speed * dt * 0.12);

    // --- Attitude: the plane eases towards the commanded bank/pitch -------
    const targetRoll = steer.roll * PL.maxBank;
    const targetPitch = steer.pitch * PL.maxPitch;
    this.roll += clamp(targetRoll - this.roll, -PL.rollSpeed * dt, PL.rollSpeed * dt);
    this.pitch += clamp(targetPitch - this.pitch, -PL.pitchSpeed * dt, PL.pitchSpeed * dt);
    // Hands off the stick: the plane levels itself, slowly.
    if (Math.abs(steer.roll) < 0.05) this.roll *= 1 - 0.8 * dt;
    if (Math.abs(steer.pitch) < 0.05) this.pitch *= 1 - 0.6 * dt;

    // --- Heading: bank turns the plane; rudder nudges it ------------------
    // Banking right (positive roll) turns right: heading grows towards east.
    const turn = Math.sin(this.roll) * PL.turnRate * (0.4 + 0.6 * (this.speed / PL.maxSpeed));
    this.heading += (turn + steer.rudder * 0.12) * dt;

    // --- Vertical: pitch trades speed for height; slow wings sink ---------
    const flying = this.speed > PL.minFlySpeed;
    let climb = Math.sin(this.pitch) * this.speed;
    if (!flying) climb -= (PL.minFlySpeed - this.speed) * 0.55; // stall sink
    if (this.throttle < 0.15 && flying) climb -= 1.2;           // idle sink
    this.verticalSpeed = climb;
    this.y += climb * dt;

    // --- Forward motion ----------------------------------------------------
    const fx = Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    this.x += fx * Math.cos(this.pitch) * this.speed * dt;
    this.z += fz * Math.cos(this.pitch) * this.speed * dt;

    // --- Stay inside the playable map --------------------------------------
    const half = CONFIG.world.size / 2 - 60;
    this.x = Math.max(-half, Math.min(half, this.x));
    this.z = Math.max(-half, Math.min(half, this.z));
    this.y = Math.min(620, this.y);

    // --- Ground, water and buildings ---------------------------------------
    const roof = this.roofHit();
    if (roof) {
      this.damage = DMG.max;
      this.crashed = true;
      this.speed = 0;
      this.y = roof + 2;
      return { hit: 'building' };
    }
    const ground = groundHeightAt(this.x, this.z);
    if (this.y <= ground + 1.6) {
      this.y = ground + 1.6;
      return this.touchDown(mission, ground);
    }
    return { hit: null };
  }

  // Called when the wheels (or the belly) meet the ground.
  touchDown(mission, ground) {
    const vs = -this.verticalSpeed; // positive = coming down hard
    const onRwy = onRunway(this.x, this.z);
    const speed = this.speed;
    const aligned = Math.abs(Math.sin(this.heading - Math.PI / 2)) < 0.35;
    this.lastTouchdown = { vs, speed, onRunway: onRwy, aligned, x: this.x, z: this.z };

    if (isSea(this.x, this.z)) {
      this.damage = Math.min(DMG.max, this.damage + DMG.waterDitch);
      this.crashed = true;
      this.speed = 0;
      return { hit: 'water' };
    }
    if (vs > DMG.crashVs || this.speed > 62) {
      this.damage = DMG.max;
      this.crashed = true;
      this.speed = 0;
      return { hit: 'ground' };
    }
    if (vs > DMG.hardTouchdownVs) {
      this.damage = Math.min(DMG.max, this.damage + 14 + vs * 2);
      if (this.damage >= DMG.max) {
        this.crashed = true;
        this.speed = 0;
        return { hit: 'ground' };
      }
    }
    // A survivable arrival: roll out, bleed speed, stop.
    this.grounded = true;
    this.landed = true;
    this.pitch = 0;
    this.roll = 0;
    this.speed = Math.max(0, this.speed - 26 * 0.016);
    return { hit: 'landed' };
  }

  // Ring pass: the plane crossed the ring's plane within its radius.
  // prev is the position before this tick's move.
  ringPassed(prev, ring) {
    const r = CONFIG.ringRadius;
    const d = dist3(this.position, ring);
    if (d < r) return true;
    // Also catch a fast crossing between ticks: segment vs sphere.
    const dx = this.x - prev.x, dy = this.y - prev.y, dz = this.z - prev.z;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 === 0) return false;
    const t = Math.max(0, Math.min(1,
      ((ring.x - prev.x) * dx + (ring.y - prev.y) * dy + (ring.z - prev.z) * dz) / len2));
    const cx = prev.x + dx * t, cy = prev.y + dy * t, cz = prev.z + dz * t;
    const cd = Math.sqrt((ring.x - cx) ** 2 + (ring.y - cy) ** 2 + (ring.z - cz) ** 2);
    return cd < r;
  }

  // Rooftop the plane is inside, or 0. Town blocks are solid.
  roofHit() {
    for (const b of buildings) {
      if (Math.abs(this.x - b.x) < b.w / 2 + 1 && Math.abs(this.z - b.z) < b.d / 2 + 1) {
        if (this.y < b.h + 1.5) return b.h;
      }
    }
    return 0;
  }

  get fuelLow() { return this.fuel < CONFIG.fuel.reserveWarning; }
  get airframeDead() { return this.damage >= DMG.max; }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
