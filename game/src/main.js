// Neon Bay — main: renderer, dusk sky, cameras, the game state machine
// (menu / playing / paused / busted / dead), the frame loop that wires every
// system together, mission hooks, save/load, and the debug API the playtest
// driver and the self-test use. This file is the game's entry point.

import * as THREE from 'three';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { City, CITY } from './city.js';
import { Player } from './player.js';
import { Traffic, Car } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { applyShot, runSelfTest } from './shots.js';
import { clamp, angleLerp, formatMoney } from './util.js';

const SAVE_MONEY_FLOOR = 0;

class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | busted | dead
    this.cameraMode = 'orbit';
    this.cameraYaw = 0; // Behind the player (player spawns facing +z).
    this.cameraPitch = 0.35;
    this.carCamHeading = 0;
    this.orbitAngle = 0;
    this.time = 0;
    this.earnedTotal = 0;
    this.bestScore = 0;
    this.prevE = false;
    this.prevEsc = false;
    this.prevF = false;
    this.missionHookIndex = -1;
    this.dialogueQueue = [];
    this.dialogueTimer = 0;
    this.saveTimer = 0;
    this.parkedCars = [];
    this.missionCar = null;
    this.params = new URLSearchParams(window.location.search);
    this.shot = this.params.get('shot');
    this.selftest = this.params.get('selftest') === '1';

    this.setupRenderer();
    this.setupScene();
    this.input = new Input(this.renderer.domElement);
    this.sounds = new SoundBank();
    this.hud = new HUD();
    this.city = new City(this.scene, 1337);
    this.player = new Player(this.scene, this.city);
    this.traffic = new Traffic(this.scene, this.city, 14);
    this.pedestrians = new Pedestrians(this.scene, this.city, 18);
    this.police = new Police(this.scene, this.city);
    this.missions = new Missions(this.scene);
    this.combat = new Combat(this.scene, this.camera);

    this.spawnParkedCars();
    this.restoreSave();
    this.wireButtons();
    this.exposeDebug();

    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'webgl';
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 60, 120);
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x241640);
    this.scene.fog = new THREE.Fog(0x2a1848, 140, 520);
    // Dusk gradient dome.
    const canvas = document.createElement('canvas');
    canvas.width = 4; canvas.height = 256;
    const g = canvas.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#12082e');
    grad.addColorStop(0.45, '#3a1c5e');
    grad.addColorStop(0.72, '#c94b6d');
    grad.addColorStop(0.86, '#ff9a5c');
    grad.addColorStop(1, '#2a1848');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(600, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(dome);
    // Low dusk sun + ambient.
    const sun = new THREE.DirectionalLight(0xffb36b, 2.8);
    sun.position.set(-180, 90, -120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x8a7bd8, 0x2a1a2a, 1.35));
    // Moon glow opposite the sun.
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(9, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf2ead8, fog: false }),
    );
    moon.position.set(260, 190, 300);
    this.scene.add(moon);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  spawnParkedCars() {
    // Parked along the roads (road lines sit at -152, -94, -36, 22, 80, 138).
    const spots = [
      [22, -60, 0], [-36, 30, Math.PI], [80, 10, Math.PI / 2], [-94, -40, -Math.PI / 2],
      [22, 100, 0], [-36, -100, Math.PI], [138, 40, Math.PI / 2], [-152, -60, 0],
    ];
    const colors = [0xc23b3b, 0x3b6fc2, 0x3bc25e, 0xd8c23a, 0x8a8f96, 0xe8e8e8];
    for (let i = 0; i < spots.length; i++) {
      const [x, z, h] = spots[i];
      const car = new Car(this.scene, x, z, h, colors[i % colors.length], {});
      this.parkedCars.push(car);
    }
  }

  restoreSave() {
    const save = loadSave();
    this.save = save;
    if (save) {
      this.bestScore = save.bestScore || 0;
      const best = document.getElementById('bestLine');
      if (this.bestScore > 0) best.textContent = 'Best score: ' + formatMoney(this.bestScore);
      document.getElementById('continueBtn').classList.remove('hidden');
    }
  }

  applySaveToGame() {
    if (!this.save) return;
    this.player.money = this.save.money || 0;
    this.earnedTotal = 0;
    this.missions.setIndex(this.save.missionIndex || 0);
    if (this.save.storyDone) this.missions.completed = true;
  }

  persist() {
    const data = {
      money: Math.max(SAVE_MONEY_FLOOR, Math.floor(this.player.money)),
      missionIndex: this.missions.completed ? MISSIONS_COUNT : this.missions.index,
      bestScore: Math.max(this.bestScore, this.earnedTotal),
      storyDone: this.missions.completed,
    };
    writeSave(data);
  }

  wireButtons() {
    document.getElementById('playBtn').addEventListener('click', () => {
      this.sounds.unlock();
      this.save = null;
      this.startGame(false);
    });
    document.getElementById('continueBtn').addEventListener('click', () => {
      this.sounds.unlock();
      this.startGame(true);
    });
    document.getElementById('resumeBtn').addEventListener('click', () => this.setPaused(false));
    document.getElementById('restartBtn').addEventListener('click', () => {
      clearSave();
      window.location.href = window.location.pathname;
    });
    document.getElementById('retryBtn').addEventListener('click', () => this.respawnAfterDeath());
    document.getElementById('freeBtn').addEventListener('click', () => this.postBail());
  }

  startGame(fromSave) {
    if (fromSave) this.applySaveToGame();
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('overScreen').classList.add('hidden');
    document.getElementById('bustedScreen').classList.add('hidden');
    this.hud.show();
    this.state = 'playing';
    this.cameraMode = 'play';
    this.cameraYaw = this.player.heading;
    this.missionHookIndex = -1;
    this.runMissionHook();
    const m = this.missions.current();
    if (m) this.queueDialogue(m);
    this.hud.setObjective(this.missions.completed ? 'Free roam — Neon Bay is yours' : this.missions.current().objective);
    this.hud.setMoney(this.player.money);
    this.hud.setHealth(this.player.health);
    this.hud.setWanted(this.police.wanted);
  }

  queueDialogue(mission) {
    this.dialogueQueue = [...mission.lines];
    this.dialogueUntil = 0;
  }

  runMissionHook() {
    const idx = this.missions.index;
    if (idx === this.missionHookIndex) return;
    this.missionHookIndex = idx;
    if (idx === 1 && !this.missionCar) {
      // The red Comet GT, parked uptown on the 80 road for job 2.
      const car = new Car(this.scene, 80, -116, 0, 0xd21f2b, { mission: true, topSpeed: 30 });
      car.isMission = true;
      this.missionCar = car;
      this.parkedCars.push(car);
    }
    if (idx === 2) {
      this.police.setWanted(3);
      this.spawnPoliceNearPlayer(2);
    }
    if (idx === 3) {
      this.police.setWanted(2);
    }
  }

  spawnPoliceNearPlayer(n) {
    for (let i = 0; i < n; i++) this.police.spawnUnit(this.player.position);
  }

  spawnPlayerInCar(x, z, heading) {
    let car = null;
    let bestD = 1e9;
    for (const c of this.allDrivableCars()) {
      if (c.isPolice) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) { bestD = d; car = c; }
    }
    if (!car || bestD > 12) {
      car = new Car(this.scene, x, z, heading, 0x3b6fc2, {});
      this.parkedCars.push(car);
    }
    car.setPosition(x, z, heading);
    this.player.car = car;
    car.isPlayer = true;
    car.stolen = true;
    this.player.person.group.visible = false;
    this.carCamHeading = heading;
  }

  allDrivableCars() {
    return [...this.traffic.cars, ...this.parkedCars];
  }

  allCars() {
    return [...this.traffic.cars, ...this.parkedCars, ...this.police.cars];
  }

  setPaused(paused) {
    if (this.state !== 'playing' && !paused) return;
    if (paused) {
      this.state = 'paused';
      document.getElementById('pauseScreen').classList.remove('hidden');
      this.sounds.setEngine(0, false);
      this.sounds.setSiren(false);
    } else {
      this.state = 'playing';
      document.getElementById('pauseScreen').classList.add('hidden');
    }
  }

  respawnAfterDeath() {
    document.getElementById('overScreen').classList.add('hidden');
    this.player.money = Math.max(0, this.player.money * 0.9);
    this.player.health = 100;
    this.player.ammo = 12;
    this.player.x = 0; this.player.z = 8; this.player.y = 0;
    if (this.player.car) { this.player.car.isPlayer = false; this.player.car = null; }
    this.player.person.group.visible = true;
    this.player.person.group.position.set(0, 0.3, 8);
    this.police.clear();
    this.state = 'playing';
    this.hud.setHealth(100);
    this.hud.toast('BACK ON YOUR FEET');
  }

  postBail() {
    document.getElementById('bustedScreen').classList.add('hidden');
    this.player.money = Math.max(0, this.player.money - 250);
    this.player.health = 100;
    this.player.x = 0; this.player.z = 8; this.player.y = 0;
    if (this.player.car) { this.player.car.isPlayer = false; this.player.car = null; }
    this.player.person.group.visible = true;
    this.player.person.group.position.set(0, 0.3, 8);
    this.police.clear();
    this.state = 'playing';
    this.hud.setHealth(100);
    this.hud.setMoney(this.player.money);
    this.hud.toast('BAIL POSTED — STAY CLEAN');
  }

  onEnterCar(car) {
    if (!car.stolen) {
      // First time this car is taken: it is a steal, and the law notices.
      car.stolen = true;
      this.police.addWanted(2);
      this.hud.toast('CAR STOLEN — WANTED LEVEL UP');
      this.sounds.pickup();
    } else {
      this.hud.toast('BACK BEHIND THE WHEEL');
    }
    this.carCamHeading = car.heading;
  }

  onExitCar() {
    this.player.exitCar();
  }

  frame() {
    const dt = Math.min(0.05, this.clockDelta());
    this.time += dt;
    if (this.state === 'menu') {
      this.updateMenuCamera(dt);
      this.traffic.update(dt, this.allCars());
      this.pedestrians.update(dt, null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state !== 'playing') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  clockDelta() {
    const now = performance.now();
    const dt = this.lastNow ? (now - this.lastNow) / 1000 : 0.016;
    this.lastNow = now;
    return dt;
  }

  updateMenuCamera(dt) {
    this.orbitAngle += dt * 0.05;
    const r = 130;
    this.camera.position.set(Math.sin(this.orbitAngle) * r, 55, Math.cos(this.orbitAngle) * r);
    this.camera.lookAt(0, 12, 0);
  }

  update(dt) {
    const input = this.input;
    // Pause toggle (edge-triggered Esc).
    const esc = input.isDown('Escape');
    if (esc && !this.prevEsc) this.setPaused(true);
    this.prevEsc = esc;

    // Mouse look.
    const look = input.consumeLook();
    this.cameraYaw -= look.dx * 0.0032;
    this.cameraPitch = clamp(this.cameraPitch + look.dy * 0.0022, -0.05, 0.85);

    // Enter / exit car (edge-triggered E).
    const eDown = input.isDown('KeyE');
    if (eDown && !this.prevE) {
      if (this.player.car) this.onExitCar();
    }
    this.prevE = eDown;

    // Punch (edge-triggered F).
    const fDown = input.isDown('KeyF');
    if (fDown && !this.prevF) {
      if (this.player.punch(this.police)) {
        this.sounds.punch();
        this.police.addWanted(1);
      }
    }
    this.prevF = fDown;

    // Shoot on click.
    if (input.consumeClick() && !this.player.car) {
      if (this.combat.shoot(this.player, this.police, this.pedestrians, (hit) => {
        this.sounds.gunshot();
        if (hit) this.hud.toast('HIT');
      })) {
        // Shot fired; wanted rises if a cop saw it (handled in combat).
      }
    }

    // Player, traffic, pedestrians, police, combat.
    const cars = this.allDrivableCars();
    this.player.update(dt, input, this.cameraYaw, cars, (car) => this.onEnterCar(car), () => {});
    this.traffic.update(dt, this.allCars());
    this.pedestrians.update(dt, this.player.position);
    this.police.update(dt, this.player, this.allCars(), () => this.onBusted());
    this.combat.update(dt);

    // Missions.
    this.runMissionHook();
    const m = this.missions.current();
    if (m && !this.missions.completed) {
      const result = this.missions.update(dt, this.player, this.police);
      if (result === 'complete') {
        const reward = this.missions.lastReward || 0;
        this.earnedTotal += reward;
        this.sounds.missionJingle();
        this.persist();
        if (this.missions.completed) {
          this.hud.toast('STORY COMPLETE — NEON BAY IS YOURS');
          this.hud.say('Mara', 'That is the whole crew paid, Rex. Neon Bay is yours now.', 7);
          this.hud.setObjective('Free roam — Neon Bay is yours');
        } else {
          const nm = this.missions.current();
          this.hud.toast('MISSION COMPLETE');
          this.hud.setObjective(nm.objective);
          this.queueDialogue(nm);
        }
      }
    }

    // Dialogue queue (wall-clock: one line every 5 real seconds).
    if (this.dialogueQueue.length > 0 && performance.now() >= (this.dialogueUntil || 0)) {
      const line = this.dialogueQueue.shift();
      const [who, ...rest] = line.split(':');
      this.hud.say(who.trim(), rest.join(':').trim(), 5);
      this.dialogueUntil = performance.now() + 5000;
    }

    // Death / busted.
    if (this.player.health <= 0 && this.state === 'playing') {
      this.state = 'dead';
      this.sounds.setEngine(0, false);
      this.sounds.setSiren(false);
      this.sounds.busted();
      document.getElementById('overScreen').classList.remove('hidden');
      this.persist();
      return;
    }

    // Interact prompt.
    if (!this.player.car) {
      let near = null;
      for (const car of cars) {
        if (car.isPolice) continue;
        const d = Math.hypot(car.x - this.player.x, car.z - this.player.z);
        if (d < 4.2) { near = car; break; }
      }
      this.hud.prompt(near ? (near.stolen ? '<b>E</b> — get in your car' : '<b>E</b> — steal this car') : null);
    } else {
      this.hud.prompt('<b>E</b> — exit car');
    }

    // HUD + minimap.
    this.hud.setHealth(this.player.health);
    this.hud.setMoney(this.player.money);
    this.hud.setWanted(this.police.wanted);
    this.hud.setSpeed(this.player.car ? Math.abs(this.player.car.speed) * 3.6 : 0, !!this.player.car);
    this.hud.setCrosshair(!this.player.car);
    const marker = this.missions.current() && this.missions.current().marker && !this.missions.completed
      ? this.missions.current().marker
      : (this.missions.current() && this.missions.current().needsPickup && !this.missions.hasPackage
        ? this.missions.current().pickupAt : null);
    this.hud.drawMinimap(this.player, this.traffic.cars, this.police, marker);
    this.hud.update(dt);

    // Sounds.
    const speed01 = this.player.car ? clamp(Math.abs(this.player.car.speed) / 30, 0, 1) : 0;
    this.sounds.setEngine(speed01, !!this.player.car);
    this.sounds.setSiren(this.police.wanted > 0);
    this.sounds.updateSiren(dt);

    // Camera.
    this.updateCamera(dt);

    // Periodic save.
    this.saveTimer += dt;
    if (this.saveTimer > 15) {
      this.saveTimer = 0;
      this.persist();
    }
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.sounds.setEngine(0, false);
    this.sounds.setSiren(false);
    this.sounds.busted();
    document.getElementById('bustedScreen').classList.remove('hidden');
    this.persist();
  }

  updateCamera(dt) {
    if (this.player.car) {
      const car = this.player.car;
      this.carCamHeading = angleLerp(this.carCamHeading, car.heading, Math.min(1, dt * 3.2));
      const back = 12, up = 5.6;
      const cx = car.x - Math.sin(this.carCamHeading) * back;
      const cz = car.z - Math.cos(this.carCamHeading) * back;
      this.camera.position.set(cx, up, cz);
      this.camera.lookAt(car.x + Math.sin(car.heading) * 6, 2.6, car.z + Math.cos(car.heading) * 6);
    } else {
      const p = this.player;
      const target = new THREE.Vector3(p.x, 2.1 + p.y, p.z);
      const dist = 7.5;
      const height = 2.6 + this.cameraPitch * 5;
      const cx = p.x - Math.sin(this.cameraYaw) * dist;
      const cz = p.z - Math.cos(this.cameraYaw) * dist;
      this.camera.position.set(cx, height + p.y, cz);
      this.camera.lookAt(target);
    }
  }

  exposeDebug() {
    const g = this;
    const debug = {
      keys: g.input.keys,
      spawnCarNearPlayer() {
        const car = new Car(g.scene, g.player.x + 3, g.player.z, 0, 0x3b6fc2, {});
        g.parkedCars.push(car);
        return car;
      },
      shoot() {
        g.combat.shoot(g.player, g.police, g.pedestrians, () => {});
      },
      teleport(x, z) {
        g.player.x = x; g.player.z = z;
        g.player.person.group.position.set(x, 0.3, z);
      },
      setWanted(n) { g.police.setWanted(n); },
      snapshot() {
        return {
          state: g.state,
          player: { x: g.player.x, z: g.player.z, health: g.player.health, money: g.player.money, inCar: !!g.player.car, ammo: g.player.ammo },
          wanted: g.police.wanted,
          policeUnits: g.police.cars.length + g.police.cops.length,
          mission: g.missions.index,
          missionDone: g.missions.completed,
          traffic: g.traffic.cars.length,
          pedestrians: g.pedestrians.people.length,
        };
      },
    };
    this.debug = debug;
    window.__game = {
      game: g,
      state: () => g.state,
      player: g.player,
      police: g.police,
      missions: g.missions,
      traffic: g.traffic,
      debug,
    };
  }
}

const MISSIONS_COUNT = 4;

const game = new Game();
window.__neonBay = game;

// Screenshot states and self-test, driven by the URL query.
if (game.shot) {
  applyShot(game, game.shot);
} else if (game.selftest) {
  setTimeout(() => runSelfTest(game), 800);
}
