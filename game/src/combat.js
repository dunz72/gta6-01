// Neon Bay — combat: the pistol (mouse aim, click to shoot, raycast against
// police) and the ammo economy. Foot cops have health and drop cash when they
// go down; the player dies at zero health.

import * as THREE from 'three';
import { clamp } from './util.js';

export class Combat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 90;
    this.tracer = null;
    this.tracerTimer = 0;
    this.cooldown = 0;
  }

  shoot(player, police, pedestrians, onShot) {
    if (this.cooldown > 0 || player.car || !player.hasPistol) return false;
    if (player.ammo <= 0) return false;
    this.cooldown = 0.28;
    player.ammo -= 1;
    // Aim from the camera centre.
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    let hitCop = null;
    let bestDist = Infinity;
    for (const cop of police.cops) {
      const toCop = new THREE.Vector3(cop.x - this.camera.position.x, 1.2 - this.camera.position.y, cop.z - this.camera.position.z);
      const dist = toCop.length();
      if (dist > 90) continue;
      const angle = toCop.normalize().angleTo(this.raycaster.ray.direction);
      if (angle < 0.09 && dist < bestDist) { bestDist = dist; hitCop = cop; }
    }
    // Tracer line from the muzzle to the hit point (or max range).
    const end = new THREE.Vector3();
    this.raycaster.ray.at(hitCop ? bestDist : 60, end);
    this.showTracer(new THREE.Vector3(player.x, 1.4, player.z), end);
    if (hitCop) {
      hitCop.health -= 34;
      police.addWanted(1);
      if (hitCop.health <= 0) player.money += 25;
    }
    pedestrians.scareAt(player.x, player.z, 30);
    if (onShot) onShot(!!hitCop);
    return true;
  }

  showTracer(from, to) {
    if (this.tracer) {
      this.scene.remove(this.tracer);
      this.tracer.geometry.dispose();
    }
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }));
    this.scene.add(this.tracer);
    this.tracerTimer = 0.07;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0 && this.tracer) {
        this.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer = null;
      }
    }
  }
}
