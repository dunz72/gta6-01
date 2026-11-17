// Neon Bay — mission chain: four jobs for the crew, each with an objective,
// a 3D beacon marker, on-screen dialogue and a cash reward. Completing the
// chain finishes the story; free roam continues after.

import * as THREE from 'three';
import { distance2D } from './util.js';

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'Job 1 — The Pickup',
    objective: 'Drive to the yellow marker on Bay Avenue',
    speaker: 'Vex',
    lines: [
      'Vex: Rex! You are out. Good. I need a driver tonight, no questions.',
      'Vex: Get yourself to the marker on Bay Avenue. Wheels help — steal one if you have to.',
    ],
    reward: 150,
    marker: { x: 22, z: -58 },
    radius: 6,
  },
  {
    id: 'hotwheels',
    title: 'Job 2 — Hot Wheels',
    objective: 'Steal the red Comet GT and deliver it to the garage',
    speaker: 'Vex',
    lines: [
      'Vex: A Comet GT is parked uptown, red, too pretty for its owner.',
      'Vex: Jack it, bring it to the garage marker. Cops will notice — drive clean.',
    ],
    reward: 400,
    marker: { x: -36, z: 58 },
    radius: 7,
    needsSteal: true,
  },
  {
    id: 'losetheheat',
    title: 'Job 3 — Lose the Heat',
    objective: 'Lose the cops — get your wanted level to zero',
    speaker: 'Vex',
    lines: [
      'Vex: That GT was flagged. Bay PD is all over you now.',
      'Vex: Break line of sight and stay hidden until the stars go out.',
    ],
    reward: 300,
    marker: null,
    radius: 0,
    needsLoseHeat: true,
  },
  {
    id: 'package',
    title: 'Job 4 — The Package',
    objective: 'Grab the package at the docks and deliver it to the pier',
    speaker: 'Mara',
    lines: [
      'Mara: Last job, Rex. A package is waiting at the docks.',
      'Mara: Carry it to the pier marker. The PD will be watching — keep moving.',
    ],
    reward: 800,
    marker: { x: -36, z: -116 },
    radius: 6,
    needsPickup: true,
    pickupAt: { x: 80, z: 116 },
  },
];

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;
    this.active = null;
    this.completed = false;
    this.hasPackage = false;
    this.beacon = null;
    this.beaconLight = null;
    this.markerMesh = null;
    this.pickupMesh = null;
    this.startMission(0);
  }

  current() { return MISSIONS[this.index] || null; }

  startMission(i) {
    this.index = i;
    const m = this.current();
    this.hasPackage = false;
    if (!m) { this.completed = true; this.clearMarker(); return; }
    this.active = m;
    this.showMarker(m.marker);
    if (m.pickupAt) this.showPickup(m.pickupAt);
    else this.clearPickup();
  }

  showMarker(at) {
    this.clearMarker();
    if (!at) return;
    const geo = new THREE.CylinderGeometry(3.2, 3.2, 0.25, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.75 });
    this.markerMesh = new THREE.Mesh(geo, mat);
    this.markerMesh.position.set(at.x, 0.35, at.z);
    this.scene.add(this.markerMesh);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    beam.position.set(at.x, 30, at.z);
    this.scene.add(beam);
    this.beacon = beam;
    const light = new THREE.PointLight(0xffd23f, 30, 40, 1.6);
    light.position.set(at.x, 6, at.z);
    this.scene.add(light);
    this.beaconLight = light;
  }

  clearMarker() {
    if (this.markerMesh) { this.scene.remove(this.markerMesh); this.markerMesh = null; }
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; }
    if (this.beaconLight) { this.scene.remove(this.beaconLight); this.beaconLight = null; }
  }

  showPickup(at) {
    this.clearPickup();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.0, 1.4),
      new THREE.MeshLambertMaterial({ color: 0x8a5a2a }),
    );
    box.position.set(at.x, 0.8, at.z);
    box.castShadow = true;
    this.scene.add(box);
    this.pickupMesh = box;
  }

  clearPickup() {
    if (this.pickupMesh) { this.scene.remove(this.pickupMesh); this.pickupMesh = null; }
  }

  // Returns 'complete' when the mission finishes, 'progress' otherwise.
  update(dt, player, police) {
    const m = this.current();
    if (!m || this.completed) return 'done';
    const pos = player.position;
    // Pulse the marker.
    if (this.markerMesh) {
      this.markerMesh.material.opacity = 0.55 + Math.sin(performance.now() * 0.005) * 0.25;
      this.markerMesh.rotation.y += dt;
    }
    if (this.pickupMesh) this.pickupMesh.rotation.y += dt * 1.5;

    if (m.needsPickup && !this.hasPackage) {
      if (!player.car && distance2D(pos.x, pos.z, m.pickupAt.x, m.pickupAt.z) < 3) {
        this.hasPackage = true;
        this.clearPickup();
        this.showMarker(m.marker);
        return 'progress';
      }
      return 'progress';
    }
    if (m.needsLoseHeat) {
      if (police.wanted === 0) return this.complete(player);
      return 'progress';
    }
    if (m.needsSteal) {
      // Complete when the player is driving the mission car inside the marker.
      if (player.car && player.car.isMission && distance2D(pos.x, pos.z, m.marker.x, m.marker.z) < m.radius) {
        return this.complete(player);
      }
      return 'progress';
    }
    if (m.marker && distance2D(pos.x, pos.z, m.marker.x, m.marker.z) < m.radius) {
      return this.complete(player);
    }
    return 'progress';
  }

  complete(player) {
    const m = this.current();
    player.money += m.reward;
    this.lastReward = m.reward;
    this.clearMarker();
    this.clearPickup();
    const next = this.index + 1;
    if (next >= MISSIONS.length) {
      this.completed = true;
      this.active = null;
      return 'complete';
    }
    this.startMission(next);
    return 'complete';
  }

  setIndex(i) {
    this.clearMarker();
    this.clearPickup();
    this.startMission(Math.max(0, Math.min(i, MISSIONS.length - 1)));
  }
}
