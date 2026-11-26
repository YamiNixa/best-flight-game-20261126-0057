// Harbor Run — main loop: states, wiring and the frame.
// Menu -> flying -> landed / crashed / complete, with pause and restart.
// URL helpers for screenshots and headless tests:
//   ?shot=cover|runway|landing|complete  stages a scene
//   ?demo=1                              autopilot flies the plane
//   ?selftest=1                          scripted flight, results in #testout

import { CONFIG } from './config.js';
import { Input } from './input.js';
import { Flight } from './physics.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Missions } from './missions.js';
import { groundHeightAt } from './world.js';

const canvas = document.getElementById('game');
const testOut = document.getElementById('testout');

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const DEMO = params.get('demo') === '1';
const SELFTEST = params.get('selftest') === '1';

const input = new Input(canvas);
const flight = new Flight();
const mission = new Missions();
const audio = new AudioEngine();
const renderer = new Renderer(canvas);
const hud = new Hud(canvas);

let state = 'menu';       // menu | flying | paused | ended
let view = 'chase';       // chase | cockpit
let message = null;       // { text, sub, until, color }
let menuCards = [];
let autopilot = DEMO;
let landingFinalHeading = null; // heading locked for the landing run, once per sortie
let time = 0;
let testLog = [];
let selftestDone = false;

function logTest(line) {
  testLog.push(line);
  if (testOut) testOut.textContent = testLog.join('\n');
  document.title = testLog[testLog.length - 1];
}

function showMessage(text, sub, seconds, color) {
  message = { text, sub: sub || '', until: time + seconds, color: color || '#ffd23e' };
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.resize(w, h);
  hud.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---- Mission start ---------------------------------------------------------
function startMission(kind) {
  mission.start(kind);
  landingFinalHeading = null;
  const spawn = kind === 'landing' ? CONFIG.finalApproach : CONFIG.startPosition;
  flight.reset(spawn);
  state = 'flying';
  audio.ensure();
  showMessage(
    kind === 'rings' ? 'RING RUN' : kind === 'circuit' ? 'HARBOUR CIRCUIT' : 'LANDING CHALLENGE',
    kind === 'rings' ? 'Thread the rings, then land on the runway'
      : kind === 'circuit' ? '4 gates, 3 laps — fly clean, fly fast'
      : 'Grease it: slow, level, on the centreline',
    3,
  );
}

// ---- Autopilot: flies towards the next target (demo + screenshots) ---------
function autopilotSteer(dt) {
  const target = mission.nextTarget();
  let desiredHeading = flight.heading;
  let desiredAlt = flight.y;
  let throttleTarget = 0.68;
  if (target) {
    desiredHeading = Math.atan2(target.x - flight.x, -(target.z - flight.z));
    desiredAlt = target.y;
  } else {
    // No target: land. Steer at the runway centre from altitude, then —
    // once close — lock the heading and sink straight ahead. Locking
    // matters: chasing a point you fly past, or re-picking a landing
    // direction every tick, makes the plane circle the strip forever
    // instead of landing on it. The locked run lands on the strip when
    // the approach is lined up, and in the field when it is not.
    const r = CONFIG.world.runway;
    const distC = Math.hypot(r.x - flight.x, r.z - flight.z);
    if (landingFinalHeading === null && distC < 450) {
      landingFinalHeading = flight.heading;
    }
    if (landingFinalHeading !== null) {
      desiredHeading = landingFinalHeading;
      desiredAlt = 1.5;
      throttleTarget = 0.30;
    } else {
      desiredHeading = Math.atan2(r.x - flight.x, -(r.z - flight.z));
      desiredAlt = Math.max(25, Math.min(140, distC * 0.09));
      throttleTarget = 0.55;
    }
  }
  let dh = desiredHeading - flight.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const roll = Math.max(-1, Math.min(1, dh * 1.6));
  const altErr = desiredAlt - flight.y;
  const pitch = Math.max(-1, Math.min(1, altErr * 0.02 - flight.verticalSpeed * 0.04));
  const throttleDelta = Math.abs(throttleTarget - flight.throttle) < 0.02
    ? 0 : Math.sign(throttleTarget - flight.throttle) * dt * 0.4;
  return {
    pitch,
    roll,
    rudder: 0,
    throttleDelta,
  };
}

// ---- One tick ---------------------------------------------------------------
function tick(dt) {
  time += dt;

  // Global keys.
  if (input.wasPressed('KeyM')) {
    audio.setMuted(!audio.muted);
  }
  if (input.wasPressed('KeyC') && state === 'flying') {
    view = view === 'chase' ? 'cockpit' : 'chase';
  }
  if (input.wasPressed('KeyR') && state !== 'menu') {
    startMission(mission.kind);
  }
  if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
    if (state === 'flying') state = 'paused';
    else if (state === 'paused') state = 'flying';
  }

  if (state === 'menu') {
    if (input.anyPressed(['Digit1'])) startMission('rings');
    else if (input.anyPressed(['Digit2'])) startMission('circuit');
    else if (input.anyPressed(['Digit3'])) startMission('landing');
    else if (input.clicked) {
      const r = canvas.getBoundingClientRect();
      const mx = input.mouseX * (r.width / 2) + r.width / 2;
      const my = input.mouseY * (r.height / 2) + r.height / 2;
      for (const card of menuCards) {
        if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
          startMission(['rings', 'circuit', 'landing'][card.index]);
          break;
        }
      }
    }
    return;
  }

  if (state === 'paused') return;

  if (state === 'ended') {
    if (input.wasPressed('KeyR') || input.clicked) startMission(mission.kind);
    if (input.anyPressed(['Digit1'])) startMission('rings');
    if (input.anyPressed(['Digit2'])) startMission('circuit');
    if (input.anyPressed(['Digit3'])) startMission('landing');
    return;
  }

  // --- Flying ---------------------------------------------------------------
  const prevPos = flight.position;
  let steer;
  if (autopilot) {
    steer = autopilotSteer(dt);
  } else {
    const kb = input.keyboardSteer();
    const ms = input.mouseSteer();
    const useMouse = input.mouseActive && kb.pitch === 0 && kb.roll === 0;
    steer = {
      pitch: useMouse ? ms.pitch : kb.pitch,
      roll: useMouse ? ms.roll : kb.roll,
      rudder: input.rudder(),
      throttleDelta: input.throttleDelta(dt),
    };
  }

  const ev = flight.step(dt, steer, mission);
  audio.update(flight, true);

  const mev = mission.update(dt, flight, prevPos);
  if (mev) {
    if (mev.type === 'ring') {
      audio.chime();
      showMessage(`RING ${mev.n} / ${mev.total}`, `+${CONFIG.score.ring} points`, 1.6, '#7ddc6a');
    } else if (mev.type === 'ringsComplete') {
      audio.chime();
      showMessage('ALL RINGS FLOWN', 'Now land on the runway for the bonus', 3, '#7ddc6a');
    } else if (mev.type === 'gate') {
      audio.chime();
      showMessage(`GATE ${mev.n}`, `+${CONFIG.score.gate} points`, 1.2, '#7ddc6a');
    } else if (mev.type === 'circuitComplete') {
      audio.fanfare();
      state = 'ended';
    }
  }

  if (ev.hit === 'landed') {
    const rep = mission.onTouchdown(flight, false);
    audio.thud(flight.lastTouchdown.vs > 4);
    if (rep) {
      if (rep.type === 'landing') {
        showMessage(rep.smooth ? 'SMOOTH LANDING' : 'LANDED',
          rep.onRunway ? 'On the runway' : 'Off the runway — find the strip next time',
          2.5, rep.smooth ? '#7ddc6a' : '#ffd23e');
      }
      if (mission.finished) {
        audio.fanfare();
        state = 'ended';
      }
    }
  } else if (ev.hit === 'water') {
    mission.onTouchdown(flight, true);
    audio.thud(true);
    state = 'ended';
  } else if (ev.hit === 'ground' || ev.hit === 'building') {
    mission.onTouchdown(flight, true);
    audio.thud(true);
    state = 'ended';
  }

  // Fuel out while airborne: the glide ends wherever it ends.
  if (flight.fuel <= 0 && flight.y <= groundHeightAt(flight.x, flight.z) + 3) {
    // touchdown handling above will catch it
  }

  // A finished sortie shows the end screen, not a stale banner.
  if (state === 'ended') message = null;
}

// ---- Frame -------------------------------------------------------------------
function frame(now) {
  const dt = Math.min(0.05, CONFIG.tick);
  tick(dt);
  const st = { flight, mission, view, time, message, muted: audio.muted };
  renderer.draw(st);
  if (state === 'menu') {
    const menu = hud.menu(st) || {};
    menuCards = menu.cards || [];
  } else {
    hud.draw(st);
    if (state === 'ended') hud.endScreen(st);
    if (state === 'paused') {
      const { ctx } = hud;
      ctx.fillStyle = 'rgba(10, 18, 30, 0.6)';
      ctx.fillRect(0, 0, hud.width, hud.height);
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', hud.width / 2, hud.height / 2);
      ctx.fillStyle = '#e8eef4';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('P to resume  •  R to restart', hud.width / 2, hud.height / 2 + 34);
      ctx.textAlign = 'left';
    }
  }
  input.endTick();
  requestAnimationFrame(frame);
}

// Run the game logic forward synchronously, without waiting for frames.
// Screenshots and headless tests stage a mid-flight scene with this:
// headless Chrome only paints a handful of frames under a virtual-time
// budget, so the scene is flown here, at load, before the first paint.
function simulate(seconds) {
  const steps = Math.round(seconds / CONFIG.tick);
  for (let i = 0; i < steps; i++) {
    if (state !== 'flying') break;
    tick(CONFIG.tick);
    input.endTick();
  }
}

// ---- Screenshot staging -------------------------------------------------------
function stageShot() {
  if (SHOT === 'cover') {
    startMission('rings');
    autopilot = true;
    simulate(14); // mid-course: a ring or two down, harbour below, ring ahead
  } else if (SHOT === 'runway') {
    startMission('rings');
    mission.ringsDone = 5; // next ring sits just past the runway
    flight.reset({ x: -620, y: 42, z: 620, heading: 90, speed: 56 });
    flight.throttle = 0.8;
    autopilot = true;
    simulate(4); // low pass over the strip, ring ahead
  } else if (SHOT === 'landing') {
    startMission('landing');
    // Short final: low, slow, lined up on the strip.
    flight.reset({ x: -520, y: 26, z: 620, heading: 90, speed: 30 });
    flight.throttle = 0.35;
    autopilot = true;
    simulate(40); // fly the approach until touchdown (or the fuel runs out)
  } else if (SHOT === 'complete') {
    startMission('rings');
    mission.ringsDone = 6;
    mission.score = 850;
    mission.elapsed = 142;
    flight.reset({ x: 120, y: 2, z: 620, heading: 90, speed: 0 });
    flight.landed = true;
    flight.grounded = true;
    flight.lastTouchdown = { vs: 1.8, speed: 28, onRunway: true, aligned: true };
    mission.landingReport = { vs: 1.8, speed: 28, onRunway: true, aligned: true, smooth: true, timeBonus: 250 };
    mission.finish(true);
    message = null; // no stale mission banner behind the end screen
    state = 'ended';
  }
  if (DEMO && !SHOT) {
    startMission('rings');
    autopilot = true;
  }
}

// ---- Self test: scripted flight, results in #testout ---------------------------
// Runs the whole sortie synchronously at load, so the result is in the DOM
// even when the headless browser only paints a few frames.
function selftest() {
  autopilot = true;
  startMission('rings');
  logTest('selftest start: rings mission, autopilot on');
  const hud0 = `alt=${Math.round(flight.y)}m speed=${Math.round(flight.speed * 3.6)}km/h fuel=${flight.fuel.toFixed(1)}`;
  logTest(`t=0s state=${state} rings=${mission.ringsDone} score=${mission.score} ${hud0}`);
  for (let chunk = 0; chunk < 9; chunk++) {
    simulate(10);
    const hdg = Math.round(((flight.heading * 180) / Math.PI + 360) % 360);
    logTest(`t=${mission.elapsed.toFixed(1)}s x=${Math.round(flight.x)} z=${Math.round(flight.z)} ` +
      `alt=${Math.round(flight.y)}m hdg=${hdg} roll=${flight.roll.toFixed(2)} pitch=${flight.pitch.toFixed(2)} ` +
      `rings=${mission.ringsDone} state=${state}`);
    if (state !== 'flying') break;
  }
  logTest(`t=${mission.elapsed.toFixed(1)}s state=${state} rings=${mission.ringsDone}/6 score=${mission.score} ` +
    `landed=${flight.landed} crashed=${flight.crashed} fuel=${flight.fuel.toFixed(1)} damage=${flight.damage} ` +
    `alt=${Math.round(flight.y)}m speed=${Math.round(flight.speed * 3.6)}km/h`);
  logTest(`SELFTEST DONE state=${state} rings=${mission.ringsDone}/6 score=${mission.score} landed=${flight.landed} crashed=${flight.crashed}`);
  logTest(mission.ringsDone >= 1 ? 'SELFTEST PASS: flew through at least one ring' : 'SELFTEST FAIL: no ring passed');
  logTest(mission.score > 0 ? 'SELFTEST PASS: score increased' : 'SELFTEST FAIL: score stayed 0');
  logTest(flight.fuel < 100 ? 'SELFTEST PASS: fuel drained' : 'SELFTEST FAIL: fuel never drained');
}

// ---- Boot ----------------------------------------------------------------------
stageShot();
if (SELFTEST) selftest();
window.__harbor = { flight, mission, input, get state() { return state; }, startMission, set autopilot(v) { autopilot = v; } };
requestAnimationFrame(frame);
