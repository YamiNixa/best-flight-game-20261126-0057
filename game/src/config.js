// Harbor Run — configuration: every tunable number for the game lives here.
// One place to balance speed, fuel, damage, rings and the world itself.

export const CONFIG = {
  title: 'Harbor Run',
  subtitle: 'A prop-plane sortie over Gullhaven Harbour',
  version: '1.0.0',

  // World dimensions (metres). The harbour town sits on a coast that runs
  // roughly east-west; the sea is to the south, the hills to the north.
  world: {
    size: 4200,          // playable square, centred on the origin
    seaLevel: -1.5,      // water plane height
    coastZ: -260,        // average coastline (z); the sea is below this
    coastWobble: 140,    // how much the coastline wanders east-west
    runway: { x: 0, z: 620, length: 700, width: 34, heading: 90 },
    town: { x0: -420, x1: 620, z0: 40, z1: 520 },   // town blocks
    hills: { z0: 1250, peak: 130 },                 // hills rise north of z0
  },

  // The aircraft: a light single-engine prop plane.
  plane: {
    maxSpeed: 72,        // m/s at full throttle (~260 km/h)
    cruiseSpeed: 48,
    minFlySpeed: 17,     // below this the wing stops flying
    accel: 14,           // m/s^2 towards the throttle target
    climbRate: 11,       // m/s at full pitch up and cruise speed
    turnRate: 0.62,      // rad/s at full bank
    maxBank: 1.05,       // rad of roll
    maxPitch: 0.55,      // rad
    rollSpeed: 2.4,      // rad/s towards the commanded bank
    pitchSpeed: 1.6,     // rad/s towards the commanded pitch
    drag: 0.12,
  },

  // Fuel: a full tank is one generous sortie, not an endless one.
  fuel: {
    capacity: 100,
    drainPerSecond: 0.55,  // at full throttle; scales with throttle
    reserveWarning: 25,
  },

  // Damage: hard touchdowns and terrain strikes hurt the airframe.
  damage: {
    max: 100,
    hardTouchdownVs: 4.5,  // vertical speed (m/s) above this hurts
    crashVs: 9,            // vertical speed above this is a crash
    terrainHit: 34,
    waterDitch: 60,
  },

  // The ring course: six glowing rings strung over the harbour.
  rings: [
    { x: -260, y: 70, z: -120 },
    { x: 120, y: 90, z: -420 },
    { x: 520, y: 70, z: -260 },
    { x: 760, y: 110, z: 120 },
    { x: 420, y: 80, z: 480 },
    { x: 40, y: 60, z: 700 },
  ],
  ringRadius: 20,

  // The timed circuit: four gates around the harbour, three laps.
  circuitGates: [
    { x: -560, y: 80, z: -300 },
    { x: 560, y: 80, z: -360 },
    { x: 700, y: 100, z: 520 },
    { x: -420, y: 90, z: 560 },
  ],
  circuitLaps: 3,

  // Scoring.
  score: {
    ring: 100,
    gate: 60,
    landing: 250,
    smoothLandingBonus: 150,
    timeBonusPerSecond: 5,
  },

  // Look: one low-poly palette for sky, sea, land and town.
  palette: {
    skyTop: '#2f6fb4',
    skyHorizon: '#bcd9ee',
    sea: '#2e7fa8',
    seaDeep: '#256b8f',
    sand: '#d9c48f',
    grass: '#6fae5e',
    grassDark: '#5b9a4e',
    hill: '#4d8a52',
    hillHigh: '#7d9b6a',
    townRoof: '#b65c4a',
    townWall: '#e8dcc8',
    townBlock: '#9aa0a3',
    runway: '#3a3f45',
    runwayMark: '#f2f2e8',
    cloud: '#ffffff',
    ring: '#ffd23e',
    ringGlow: '#ff9d00',
  },

  // Camera and view.
  camera: {
    chaseDistance: 24,
    chaseHeight: 6.5,
    fov: 78,             // degrees
    cockpitOffsetY: 1.1,
  },

  // Timing.
  tick: 1 / 60,
  startFuel: 100,
  startPosition: { x: -900, y: 120, z: 620, heading: 90, speed: 42 },
  finalApproach: { x: -1400, y: 90, z: 620, heading: 90, speed: 40 },
};

// Key bindings shown on the menu and the help line.
export const KEYS = {
  throttleUp: ['KeyW'],
  throttleDown: ['KeyS'],
  pitchUp: ['ArrowUp'],
  pitchDown: ['ArrowDown'],
  rollLeft: ['ArrowLeft', 'KeyA'],
  rollRight: ['ArrowRight', 'KeyD'],
  rudderLeft: ['KeyQ'],
  rudderRight: ['KeyE'],
  view: ['KeyC'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  mute: ['KeyM'],
  mission1: ['Digit1'],
  mission2: ['Digit2'],
  mission3: ['Digit3'],
};
