// Harbor Run — render: a low-poly pseudo-3D view drawn on plain Canvas 2D.
// One consistent palette for sky, sea, land and town; the aircraft is drawn
// as a built prop plane, never a sprite borrowed from anywhere.

import { CONFIG } from './config.js';
import {
  groundHeightAt, groundColor, isSea, coastZAt,
  buildings, clouds, onRunway,
} from './world.js';

const P = CONFIG.palette;
const W = CONFIG.world;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.focal = (this.height / 2) / Math.tan((CONFIG.camera.fov / 2) * Math.PI / 180);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.width = w;
    this.height = h;
    this.focal = (h / 2) / Math.tan((CONFIG.camera.fov / 2) * Math.PI / 180);
  }

  // Camera basis from a heading (rad), pitch (rad) and roll (rad).
  cameraBasis(heading, pitch, roll) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f = [Math.sin(heading) * cp, sp, -Math.cos(heading) * cp];
    const r = [Math.cos(heading), 0, Math.sin(heading)];
    // up = r x f
    const u = [
      r[1] * f[2] - r[2] * f[1],
      r[2] * f[0] - r[0] * f[2],
      r[0] * f[1] - r[1] * f[0],
    ];
    return { f, r, u, roll };
  }

  // Project a world point into screen space. Returns null behind the camera.
  project(p, cam, basis) {
    const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
    let xc = dx * basis.r[0] + dy * basis.r[1] + dz * basis.r[2];
    let yc = dx * basis.u[0] + dy * basis.u[1] + dz * basis.u[2];
    const zc = dx * basis.f[0] + dy * basis.f[1] + dz * basis.f[2];
    if (zc < 3) return null;
    // Roll the view around the forward axis.
    const cr = Math.cos(basis.roll), sr = Math.sin(basis.roll);
    const xr = xc * cr - yc * sr;
    const yr = xc * sr + yc * cr;
    return {
      x: this.width / 2 + (xr / zc) * this.focal,
      y: this.height / 2 - (yr / zc) * this.focal,
      d: zc,
    };
  }

  draw(state) {
    const { ctx } = this;
    const { flight, mission, view, time } = state;
    const w = this.width, h = this.height;
    this.flight = flight;

    // --- Camera ------------------------------------------------------------
    const heading = flight.heading;
    const pitch = flight.pitch * 0.55;
    let cam, basis;
    if (view === 'cockpit') {
      cam = {
        x: flight.x + Math.sin(heading) * 1.5,
        y: flight.y + CONFIG.camera.cockpitOffsetY,
        z: flight.z - Math.cos(heading) * 1.5,
      };
      basis = this.cameraBasis(heading, flight.pitch, flight.roll * 0.35);
    } else {
      const f = [Math.sin(heading), 0, -Math.cos(heading)];
      cam = {
        x: flight.x - f[0] * CONFIG.camera.chaseDistance,
        y: flight.y + CONFIG.camera.chaseHeight,
        z: flight.z - f[2] * CONFIG.camera.chaseDistance,
      };
      basis = this.cameraBasis(heading, pitch, flight.roll * 0.4);
    }

    // --- Sky ---------------------------------------------------------------
    const horizonY = h / 2 + Math.tan(flight.pitch * 0.5) * this.focal
      - Math.sin(flight.roll) * 0;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, P.skyTop);
    sky.addColorStop(0.55, P.skyHorizon);
    sky.addColorStop(0.56, '#cfe3d8');
    sky.addColorStop(1, '#5d7a52');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Sun: a soft disc fixed in the western sky.
    const sun = this.project({ x: cam.x - 2600, y: 900, z: cam.z - 1400 }, cam, basis);
    if (sun) {
      ctx.fillStyle = 'rgba(255, 244, 200, 0.95)';
      ctx.beginPath(); ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 244, 200, 0.25)';
      ctx.beginPath(); ctx.arc(sun.x, sun.y, 46, 0, Math.PI * 2); ctx.fill();
    }

    // Base ground wash below the horizon so no hole ever shows sky.
    ctx.fillStyle = P.grassDark;
    ctx.fillRect(0, Math.max(0, horizonY), w, h - Math.max(0, horizonY));

    // --- Terrain grid ------------------------------------------------------
    this.drawTerrain(cam, basis);

    // --- Runway markings ---------------------------------------------------
    this.drawRunway(cam, basis);

    // --- Town buildings ----------------------------------------------------
    this.drawBuildings(cam, basis, time);

    // --- Mission rings ------------------------------------------------------
    this.drawRings(cam, basis, mission, time);

    // --- Clouds -------------------------------------------------------------
    this.drawClouds(cam, basis, time);

    // --- The aircraft -------------------------------------------------------
    if (view === 'cockpit') this.drawCockpit(state);
    else this.drawPlane(state);
  }

  drawTerrain(cam, basis) {
    const { ctx } = this;
    const cell = 100;
    const range = 15;
    const cx = Math.floor(cam.x / cell), cz = Math.floor(cam.z / cell);
    const quads = [];
    for (let i = -range; i <= range; i++) {
      for (let j = -range; j <= range; j++) {
        const x0 = (cx + i) * cell, z0 = (cz + j) * cell;
        const ccx = x0 + cell / 2, ccz = z0 + cell / 2;
        const ddx = ccx - cam.x, ddz = ccz - cam.z;
        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist > 1750) continue;
        const corners = [
          { x: x0, y: this.cornerHeight(x0, z0), z: z0 },
          { x: x0 + cell, y: this.cornerHeight(x0 + cell, z0), z: z0 },
          { x: x0 + cell, y: this.cornerHeight(x0 + cell, z0 + cell), z: z0 + cell },
          { x: x0, y: this.cornerHeight(x0, z0 + cell), z: z0 + cell },
        ];
        quads.push({ corners, dist, color: groundColor(ccx, ccz) });
      }
    }
    quads.sort((a, b) => b.dist - a.dist);
    for (const q of quads) {
      const pts = q.corners.map((c) => this.project(c, cam, basis));
      if (pts.some((p) => !p)) continue;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < 4; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  cornerHeight(x, z) {
    return isSea(x, z) ? W.seaLevel : groundHeightAt(x, z);
  }

  drawRunway(cam, basis) {
    const { ctx } = this;
    const r = W.runway;
    // Asphalt strip (the terrain grid is too coarse to paint a 34 m strip).
    this.quad(cam, basis, [
      { x: r.x - r.length / 2, y: 0.35, z: r.z - r.width / 2 },
      { x: r.x + r.length / 2, y: 0.35, z: r.z - r.width / 2 },
      { x: r.x + r.length / 2, y: 0.35, z: r.z + r.width / 2 },
      { x: r.x - r.length / 2, y: 0.35, z: r.z + r.width / 2 },
    ], P.runway);
    // White edge lines.
    for (const edge of [-r.width / 2 + 2, r.width / 2 - 2]) {
      this.quad(cam, basis, [
        { x: r.x - r.length / 2, y: 0.4, z: r.z + edge - 1 },
        { x: r.x + r.length / 2, y: 0.4, z: r.z + edge - 1 },
        { x: r.x + r.length / 2, y: 0.4, z: r.z + edge + 1 },
        { x: r.x - r.length / 2, y: 0.4, z: r.z + edge + 1 },
      ], P.runwayMark);
    }
    // Centreline dashes and threshold bars, as flat projected quads.
    const dashes = [];
    for (let d = -r.length / 2 + 30; d < r.length / 2 - 20; d += 60) {
      dashes.push({ x: r.x + d, z: r.z, w: 18, d2: 2.5 });
    }
    for (const q of dashes) {
      const pts = [
        { x: q.x - q.w / 2, y: 0.4, z: q.z - q.d2 / 2 },
        { x: q.x + q.w / 2, y: 0.4, z: q.z - q.d2 / 2 },
        { x: q.x + q.w / 2, y: 0.4, z: q.z + q.d2 / 2 },
        { x: q.x - q.w / 2, y: 0.4, z: q.z + q.d2 / 2 },
      ].map((c) => this.project(c, cam, basis));
      if (pts.some((p) => !p)) continue;
      ctx.fillStyle = P.runwayMark;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < 4; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath(); ctx.fill();
    }
  }

  // Draw one quad from world corners; returns false if off-screen.
  quad(cam, basis, corners, fill) {
    const pts = corners.map((c) => this.project(c, cam, basis));
    if (pts.some((p) => !p)) return false;
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath(); ctx.fill();
    return true;
  }

  drawBuildings(cam, basis) {
    const sorted = buildings
      .map((b) => ({ b, d: (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2 }))
      .filter((o) => o.d < 1750 * 1750)
      .sort((a, b) => b.d - a.d);
    for (const { b } of sorted) {
      const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
      const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
      const top = b.h;
      const wall = b.lighthouse ? '#f4f1e8' : P.townWall;
      const roof = b.lighthouse ? '#c23b2e' : P.townRoof;
      // Roof (top face).
      this.quad(cam, basis, [
        { x: x0, y: top, z: z0 }, { x: x1, y: top, z: z0 },
        { x: x1, y: top, z: z1 }, { x: x0, y: top, z: z1 },
      ], roof);
      // Two most visible walls: pick by camera side.
      const south = cam.z > b.z;
      const east = cam.x > b.x;
      if (south) {
        this.quad(cam, basis, [
          { x: x0, y: 0, z: z1 }, { x: x1, y: 0, z: z1 },
          { x: x1, y: top, z: z1 }, { x: x0, y: top, z: z1 },
        ], wall);
      } else {
        this.quad(cam, basis, [
          { x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z0 },
          { x: x1, y: top, z: z0 }, { x: x0, y: top, z: z0 },
        ], wall);
      }
      if (east) {
        this.quad(cam, basis, [
          { x: x1, y: 0, z: z0 }, { x: x1, y: 0, z: z1 },
          { x: x1, y: top, z: z1 }, { x: x1, y: top, z: z0 },
        ], shade(wall, 0.82));
      } else {
        this.quad(cam, basis, [
          { x: x0, y: 0, z: z0 }, { x: x0, y: 0, z: z1 },
          { x: x0, y: top, z: z1 }, { x: x0, y: top, z: z0 },
        ], shade(wall, 0.82));
      }
      // Lighthouse lamp: a warm glow at the top.
      if (b.lighthouse) {
        const lamp = this.project({ x: b.x, y: b.h + 4, z: b.z }, cam, basis);
        if (lamp) {
          const { ctx } = this;
          ctx.fillStyle = 'rgba(255, 220, 120, 0.9)';
          ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  drawRings(cam, basis, mission, time) {
    const { ctx } = this;
    const targets = mission.visibleTargets();
    for (const t of targets) {
      // Guide column from the ground up to the ring.
      const base = this.project({ x: t.x, y: groundHeightAt(t.x, t.z) + 1, z: t.z }, cam, basis);
      const top = this.project(t, cam, basis);
      if (base && top) {
        ctx.strokeStyle = 'rgba(255, 210, 62, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
      }
      // Ring circle, facing the approach direction.
      const normal = t.normal || { x: 0, z: -1 };
      const side = { x: -normal.z, z: normal.x };
      const R = CONFIG.ringRadius;
      const pts = [];
      for (let k = 0; k <= 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        pts.push(this.project({
          x: t.x + side.x * Math.cos(a) * R,
          y: t.y + Math.sin(a) * R,
          z: t.z + side.z * Math.cos(a) * R,
        }, cam, basis));
      }
      if (pts.some((p) => !p)) continue;
      const pulse = 0.75 + 0.25 * Math.sin(time * 3 + t.x);
      ctx.strokeStyle = t.done ? 'rgba(120, 220, 130, 0.9)' : `rgba(255, 210, 62, ${pulse})`;
      ctx.lineWidth = t.done ? 3 : 5;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath(); ctx.stroke();
      // Distance label above the next target.
      if (t.next && top) {
        const d = Math.round(Math.sqrt(
          (t.x - this.flight.x) ** 2 + (t.y - this.flight.y) ** 2 + (t.z - this.flight.z) ** 2));
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${t.label}  ${d}m`, top.x, top.y - R * 0.9 - 14);
      }
    }
  }

  drawClouds(cam, basis, time) {
    const { ctx } = this;
    for (const c of clouds) {
      const cx = c.x + ((time * c.drift) % 4000);
      const p = this.project({ x: cx - 2000, y: c.y, z: c.z }, cam, basis);
      if (!p || p.d > 2600) continue;
      const s = (c.s / p.d) * this.focal;
      if (s < 4) continue;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.38, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - s * 0.5, p.y + s * 0.08, s * 0.6, s * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + s * 0.5, p.y + s * 0.06, s * 0.65, s * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The chase-view aircraft: a cream-and-red prop plane with a spinning prop.
  drawPlane(state) {
    const { ctx } = this;
    const { flight, time } = state;
    const w = this.width, h = this.height;
    const cx = w / 2, cy = h * 0.62;
    const s = Math.min(w, h) / 620; // plane scale
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(flight.roll * 0.55);
    ctx.scale(s, s);

    // Shadow on the ground far below (a soft ellipse, purely a feel cue).
    // Tail and wings first, fuselage on top.
    ctx.fillStyle = '#8c2f26'; // tail
    ctx.beginPath();
    ctx.moveTo(-14, 26); ctx.lineTo(-52, 44); ctx.lineTo(-52, 54); ctx.lineTo(-10, 40);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 26); ctx.lineTo(52, 44); ctx.lineTo(52, 54); ctx.lineTo(10, 40);
    ctx.closePath(); ctx.fill();
    // Main wings.
    ctx.fillStyle = '#c23b2e';
    ctx.beginPath();
    ctx.moveTo(-8, 8); ctx.lineTo(-150, 34); ctx.lineTo(-150, 52); ctx.lineTo(-8, 30);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 8); ctx.lineTo(150, 34); ctx.lineTo(150, 52); ctx.lineTo(8, 30);
    ctx.closePath(); ctx.fill();
    // Fuselage.
    ctx.fillStyle = '#f4ead2';
    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.quadraticCurveTo(13, -30, 12, 6);
    ctx.lineTo(10, 52);
    ctx.quadraticCurveTo(0, 60, -10, 52);
    ctx.lineTo(-12, 6);
    ctx.quadraticCurveTo(-13, -30, 0, -62);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8c2f26'; ctx.lineWidth = 2; ctx.stroke();
    // Red cheatline and registration.
    ctx.fillStyle = '#c23b2e';
    ctx.fillRect(-11, 18, 22, 5);
    ctx.fillStyle = '#3a3f45';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('G-HARB', 0, 44);
    // Cockpit canopy.
    ctx.fillStyle = '#9fd4e8';
    ctx.beginPath();
    ctx.ellipse(0, -18, 8, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a6a72'; ctx.lineWidth = 1.5; ctx.stroke();
    // Propeller: blurred disc plus two blades that spin with time.
    const spin = time * 28;
    ctx.fillStyle = 'rgba(90, 90, 90, 0.18)';
    ctx.beginPath(); ctx.ellipse(0, -66, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(0, -62);
    ctx.rotate(spin);
    ctx.fillStyle = '#2e2a26';
    ctx.fillRect(-2, -30, 4, 60);
    ctx.restore();
    ctx.fillStyle = '#c23b2e';
    ctx.beginPath(); ctx.arc(0, -62, 5, 0, Math.PI * 2); ctx.fill();
    // Landing gear.
    ctx.strokeStyle = '#3a3f45'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, 34); ctx.lineTo(-14, 62); ctx.moveTo(8, 34); ctx.lineTo(14, 62); ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-14, 64, 5, 0, Math.PI * 2); ctx.arc(14, 64, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Cockpit view: dashboard with lit gauges, nose cowling, windscreen frame.
  drawCockpit(state) {
    const { ctx } = this;
    const { flight } = state;
    const w = this.width, h = this.height;
    // Nose cowling at the bottom centre.
    ctx.fillStyle = '#c23b2e';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 130, h);
    ctx.quadraticCurveTo(w / 2, h - 130, w / 2 + 130, h);
    ctx.closePath(); ctx.fill();
    // Spinning prop arc across the windscreen.
    const t = state.time;
    ctx.strokeStyle = 'rgba(40, 40, 40, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 150 + 20 * Math.sin(t * 20), 0, Math.PI * 2); ctx.stroke();
    // Dashboard panel.
    const panelY = h - 118;
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, panelY, w, 118);
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(0, panelY, w, 4);
    // Gauge helpers.
    const gauge = (x, y, r, label, value, min, max, unit) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#14171c';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 2; ctx.stroke();
      // Tick marks.
      ctx.strokeStyle = '#9aa0a3'; ctx.lineWidth = 1;
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
        ctx.lineTo(Math.cos(a) * (r - 9), Math.sin(a) * (r - 9));
        ctx.stroke();
      }
      const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
      const a = Math.PI * 0.75 + frac * Math.PI * 1.5;
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8)); ctx.stroke();
      ctx.fillStyle = '#e8e2d0';
      ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, 0, r + 13);
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`${Math.round(value)}${unit}`, 0, 5);
      ctx.restore();
    };
    const gx = w / 2;
    gauge(gx - 300, panelY + 52, 40, 'AIRSPEED', flight.speed * 3.6, 0, 260, '');
    gauge(gx - 150, panelY + 52, 40, 'ALTITUDE', flight.y, 0, 600, '');
    gauge(gx, panelY + 52, 40, 'HEADING', ((flight.heading * 180) / Math.PI + 360) % 360, 0, 360, '°');
    gauge(gx + 150, panelY + 52, 40, 'FUEL', flight.fuel, 0, 100, '%');
    gauge(gx + 300, panelY + 52, 40, 'THROTTLE', flight.throttle * 100, 0, 100, '%');
    // Windscreen pillars.
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, 0, 14, h - 118);
    ctx.fillRect(w - 14, 0, 14, h - 118);
  }
}

// Darken a hex colour by a factor (for shaded walls).
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r}, ${g}, ${b})`;
}
