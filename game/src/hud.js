// Neon Bay — HUD: health bar, money, wanted stars, speed, mission objective,
// dialogue, toasts, the interact prompt, and the circular minimap (roads,
// player arrow, traffic, police, mission marker) drawn on a 2D canvas.

import { formatMoney } from './util.js';
import { CITY } from './city.js';

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.healthBar = document.getElementById('healthBar');
    this.moneyEl = document.getElementById('money');
    this.wantedEl = document.getElementById('wanted');
    this.speedEl = document.getElementById('speed');
    this.objectiveEl = document.getElementById('objective');
    this.dialogueEl = document.getElementById('dialogue');
    this.toastEl = document.getElementById('toast');
    this.interactEl = document.getElementById('interact');
    this.crosshair = document.getElementById('crosshair');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.dialogueUntil = 0;
    this.toastUntil = 0;
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  setHealth(h) {
    this.healthBar.style.width = Math.max(0, Math.min(100, h)) + '%';
    this.healthBar.style.background = h > 50 ? 'linear-gradient(90deg,#37e05a,#a8f04a)' : h > 25 ? 'linear-gradient(90deg,#e0a537,#f04a4a)' : '#e03737';
  }

  setMoney(m) { this.moneyEl.textContent = formatMoney(m); }

  setWanted(n) {
    let html = '';
    for (let i = 0; i < 5; i++) html += i < n ? '★' : '<span class="off">★</span>';
    this.wantedEl.innerHTML = html;
  }

  setSpeed(kmh, inCar) {
    if (inCar) {
      this.speedEl.classList.remove('hidden');
      this.speedEl.innerHTML = Math.round(kmh) + ' <small>km/h</small>';
    } else {
      this.speedEl.classList.add('hidden');
    }
  }

  setObjective(text) {
    this.objectiveEl.innerHTML = text ? '<b>MISSION</b> — ' + text : '';
  }

  // Dialogue/toast timers run on WALL-CLOCK time, not game time, so a line
  // never overstays on a slow machine (or in a slow screenshot run).
  say(who, text, seconds = 5) {
    this.dialogueEl.innerHTML = '<span class="who">' + who + ':</span> ' + text;
    this.dialogueEl.classList.remove('hidden');
    this.dialogueUntil = performance.now() + seconds * 1000;
  }

  toast(text, seconds = 2.6) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastUntil = performance.now() + seconds * 1000;
  }

  prompt(html) {
    if (html) {
      this.interactEl.innerHTML = html;
      this.interactEl.classList.remove('hidden');
    } else {
      this.interactEl.classList.add('hidden');
    }
  }

  setCrosshair(on) {
    this.crosshair.classList.toggle('hidden', !on);
  }

  update(dt) {
    const now = performance.now();
    if (this.dialogueUntil && now > this.dialogueUntil) {
      this.dialogueEl.classList.add('hidden');
      this.dialogueUntil = 0;
    }
    if (this.toastUntil && now > this.toastUntil) {
      this.toastEl.classList.add('hidden');
      this.toastUntil = 0;
    }
  }

  drawMinimap(player, trafficCars, police, missionMarker) {
    const ctx = this.mapCtx;
    const S = 180;
    const half = CITY.half + 24;
    const toMap = (x, z) => [S / 2 + (x / half) * (S / 2 - 6), S / 2 + (z / half) * (S / 2 - 6)];
    ctx.clearRect(0, 0, S, S);
    // City disc.
    ctx.fillStyle = '#12142a';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.fill();
    // Roads.
    ctx.strokeStyle = '#3a3f52';
    ctx.lineWidth = 4;
    const step = 44 + 14;
    for (let k = 0; k <= 5; k++) {
      const c = -CITY.half + k * step + 7 - 7;
      const [x1] = toMap(c, 0);
      ctx.beginPath(); ctx.moveTo(x1, 4); ctx.lineTo(x1, S - 4); ctx.stroke();
      const [, y1] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(4, y1); ctx.lineTo(S - 4, y1); ctx.stroke();
    }
    // Mission marker.
    if (missionMarker) {
      const [mx, my] = toMap(missionMarker.x, missionMarker.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse); ctx.lineTo(mx + pulse, my); ctx.lineTo(mx, my + pulse); ctx.lineTo(mx - pulse, my);
      ctx.closePath(); ctx.fill();
    }
    // Traffic.
    ctx.fillStyle = '#e8e86a';
    for (const car of trafficCars) {
      const [x, y] = toMap(car.x, car.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Police.
    ctx.fillStyle = '#4da6ff';
    for (const car of police.cars) {
      const [x, y] = toMap(car.x, car.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    for (const cop of police.cops) {
      const [x, y] = toMap(cop.x, cop.z);
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const pos = player.position;
    const [px, py] = toMap(pos.x, pos.z);
    const heading = player.car ? player.car.heading : player.heading;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-heading);
    ctx.fillStyle = '#37e05a';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
