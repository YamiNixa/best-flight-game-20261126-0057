// Harbor Run — HUD: the instruments the pilot actually flies by.
// Altitude, speed and heading tapes, fuel and damage gauges, the mission
// objective, the timer and the score, all drawn on the game canvas.

import { CONFIG } from './config.js';
import { headingDegrees } from './world.js';

export class Hud {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
  }

  resize(w, h) { this.width = w; this.height = h; }

  draw(state) {
    const { ctx } = this;
    const { flight, mission, view, time, message, muted } = state;
    const w = this.width, h = this.height;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // --- Top bar: title, mission objective, timer, score -------------------
    ctx.fillStyle = 'rgba(16, 24, 34, 0.72)';
    ctx.fillRect(0, 0, w, 46);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('HARBOR RUN', 14, 29);
    ctx.fillStyle = '#e8eef4';
    ctx.font = '15px system-ui, sans-serif';
    const obj = mission.objectiveText();
    ctx.fillText(obj, 170, 29);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`SCORE ${mission.score}`, w - 14, 29);
    ctx.fillStyle = '#e8eef4';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(mission.timerText(), w - 170, 29);
    ctx.textAlign = 'left';

    // --- Left tape: airspeed ------------------------------------------------
    this.tape(14, 70, 'SPEED', Math.round(flight.speed * 3.6), 'km/h', 0, 260);
    // --- Right tape: altitude ----------------------------------------------
    this.tape(w - 114, 70, 'ALT', Math.round(flight.y), 'm', 0, 600);
    // --- Heading compass ----------------------------------------------------
    this.compass(w / 2, 66, headingDegrees(flight.heading));

    // --- Fuel and damage gauges, bottom left --------------------------------
    this.gaugeBar(14, h - 66, 190, 'FUEL', flight.fuel, 100,
      flight.fuelLow ? '#ff5a3c' : '#7ddc6a');
    this.gaugeBar(14, h - 38, 190, 'AIRFRAME', 100 - flight.damage, 100,
      flight.damage > 60 ? '#ff5a3c' : '#ffd23e');
    // Throttle bar, bottom right.
    this.gaugeBar(w - 204, h - 66, 190, 'THROTTLE', flight.throttle * 100, 100, '#6fb7ff');
    ctx.fillStyle = '#e8eef4';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(view === 'cockpit' ? 'COCKPIT VIEW  [C]' : 'CHASE VIEW  [C]', w - 14, h - 40);
    ctx.fillText(muted ? 'SOUND OFF  [M]' : 'SOUND ON  [M]', w - 14, h - 22);
    ctx.textAlign = 'left';

    // --- Centre message (landing, crash, ring, warnings) --------------------
    if (message && message.until > time) {
      const alpha = Math.min(1, (message.until - time) / 0.4);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(16, 24, 34, 0.7)';
      const tw = ctx.measureText(message.text).width;
      ctx.fillRect(w / 2 - tw / 2 - 18, h * 0.30 - 32, tw + 36, 46);
      ctx.fillStyle = message.color || '#ffd23e';
      ctx.fillText(message.text, w / 2, h * 0.30);
      if (message.sub) {
        ctx.font = '15px system-ui, sans-serif';
        ctx.fillStyle = '#e8eef4';
        ctx.fillText(message.sub, w / 2, h * 0.30 + 26);
      }
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // --- Low fuel / damage warnings -----------------------------------------
    if (flight.fuelLow && !flight.crashed) {
      this.blinkWarning(w / 2, h - 120, 'LOW FUEL — FIND THE RUNWAY', time);
    }
    if (flight.damage > 55 && !flight.crashed) {
      this.blinkWarning(w / 2, h - 96, 'AIRFRAME DAMAGE — LAND SOON', time);
    }
    ctx.restore();
  }

  tape(x, y, label, value, unit, min, max) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(16, 24, 34, 0.72)';
    ctx.fillRect(x, y, 100, 64);
    ctx.fillStyle = '#9fb4c8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(label, x + 8, y + 15);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(String(value), x + 8, y + 44);
    ctx.fillStyle = '#9fb4c8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(unit, x + 8, y + 59);
    const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(x + 92, y + 8, 4, 48 * (1 - frac));
  }

  compass(cx, y, heading) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(16, 24, 34, 0.72)';
    ctx.fillRect(cx - 150, y - 16, 300, 34);
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - 150, y - 16, 300, 34); ctx.clip();
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const points = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'], [360, 'N']];
    for (const [deg, label] of points) {
      let d = deg - heading;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      const x = cx + d * 2.2;
      if (x < cx - 150 || x > cx + 150) continue;
      ctx.fillStyle = Math.abs(d) < 4 ? '#ffd23e' : '#e8eef4';
      ctx.fillText(label, x, y + 5);
      ctx.fillStyle = '#9fb4c8';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(String(deg % 360), x, y + 16);
      ctx.font = 'bold 14px system-ui, sans-serif';
    }
    ctx.restore();
    // Centre caret.
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(cx - 6, y - 16); ctx.lineTo(cx + 6, y - 16); ctx.lineTo(cx, y - 8);
    ctx.closePath(); ctx.fill();
    ctx.textAlign = 'left';
  }

  gaugeBar(x, y, w, label, value, max, color) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(16, 24, 34, 0.72)';
    ctx.fillRect(x, y, w, 20);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, (w - 4) * Math.max(0, Math.min(1, value / max)), 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(`${label} ${Math.round(value)}${label === 'FUEL' ? '%' : ''}`, x + 8, y + 14);
  }

  blinkWarning(cx, y, text, time) {
    if (Math.floor(time * 2) % 2 === 0) return;
    const { ctx } = this;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a3c';
    ctx.fillText(text, cx, y);
    ctx.textAlign = 'left';
  }

  // --- Full-screen overlays -------------------------------------------------
  menu(state, missions) {
    const { ctx } = this;
    const w = this.width, h = this.height;
    ctx.fillStyle = 'rgba(10, 18, 30, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText('HARBOR RUN', w / 2, h * 0.24);
    ctx.fillStyle = '#e8eef4';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('A prop-plane sortie over Gullhaven Harbour', w / 2, h * 0.24 + 34);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Pick a mission — 1, 2 or 3, or click a card:', w / 2, h * 0.40);
    const cards = [
      { n: '1', name: 'RING RUN', desc: 'Thread 6 glowing rings over the harbour,\nthen land on the runway for the bonus.' },
      { n: '2', name: 'HARBOUR CIRCUIT', desc: 'Race 4 gates, 3 laps, against the clock.\nEvery gate is 60 points.' },
      { n: '3', name: 'LANDING CHALLENGE', desc: 'On final approach already. Grease it:\nslow, level, on the centreline.' },
    ];
    const cw = 300, gap = 24;
    const x0 = w / 2 - (cw * 3 + gap * 2) / 2;
    const y0 = h * 0.46;
    cards.forEach((c, i) => {
      const x = x0 + i * (cw + gap);
      ctx.fillStyle = 'rgba(16, 24, 34, 0.85)';
      ctx.fillRect(x, y0, cw, 150);
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y0, cw, 150);
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText(`[${c.n}]  ${c.name}`, w / 2 + (x + cw / 2 - w / 2), y0 + 36);
      ctx.fillStyle = '#e8eef4';
      ctx.font = '14px system-ui, sans-serif';
      c.desc.split('\n').forEach((line, k) => {
        ctx.fillText(line, x + cw / 2, y0 + 70 + k * 22);
      });
    });
    ctx.fillStyle = '#c8d4de';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('W / S throttle  •  Arrow keys pitch & roll  •  Q / E rudder  •  Mouse steers too', w / 2, h * 0.46 + 185);
    ctx.fillText('C cockpit view  •  P pause  •  R restart  •  M sound', w / 2, h * 0.46 + 210);
    ctx.fillText('Fuel burns with throttle. Hard landings damage the airframe. Mind the rooftops.', w / 2, h * 0.46 + 235);
    ctx.textAlign = 'left';
    return { cards: cards.map((c, i) => ({ x: x0 + i * (cw + gap), y: y0, w: cw, h: 150, index: i })) };
  }

  endScreen(state) {
    const { ctx } = this;
    const w = this.width, h = this.height;
    const { mission, flight } = state;
    ctx.fillStyle = 'rgba(10, 18, 30, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    const title = mission.resultTitle();
    ctx.fillStyle = mission.success ? '#7ddc6a' : '#ff5a3c';
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillText(title, w / 2, h * 0.30);
    ctx.fillStyle = '#e8eef4';
    ctx.font = '19px system-ui, sans-serif';
    mission.resultLines().forEach((line, i) => {
      ctx.fillText(line, w / 2, h * 0.30 + 40 + i * 30);
    });
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`FINAL SCORE  ${mission.score}`, w / 2, h * 0.30 + 40 + mission.resultLines().length * 30 + 16);
    ctx.fillStyle = '#c8d4de';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Press R or click to fly again  •  1 / 2 / 3 for another mission', w / 2, h * 0.30 + 40 + mission.resultLines().length * 30 + 56);
    ctx.textAlign = 'left';
  }
}
