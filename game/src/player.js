// Neon Bay — the player on foot and behind the wheel: third-person movement,
// jumping, entering and exiting cars, punching, and the pistol. The player owns
// health, money and ammo; death and arrest are handled by the main loop.

import * as THREE from 'three';
import { clamp, distance2D } from './util.js';
import { makePerson, animateWalk, resetPose } from './character.js';

export class Player {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.person = makePerson({ shirt: 0xffd23f, pants: 0x22242c, skin: 0xc98d64, hair: 0x2a1a0a });
    this.x = 0; this.z = 8;
    this.heading = 0;
    this.y = 0; this.vy = 0;
    this.onGround = true;
    this.health = 100;
    this.money = 0;
    this.ammo = 12;
    this.hasPistol = true;
    this.car = null; // Car instance when driving.
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.hurtTimer = 0;
    this.person.group.position.set(this.x, 0.3, this.z);
    scene.add(this.person.group);
  }

  get position() { return this.car ? { x: this.car.x, z: this.car.z, inCar: true } : { x: this.x, z: this.z, inCar: false }; }

  damage(amount) {
    if (this.hurtTimer > 0) return;
    this.health -= amount;
    this.hurtTimer = 0.5;
    if (this.health < 0) this.health = 0;
  }

  update(dt, input, cameraYaw, cars, onEnterCar, onExitCar) {
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.punchTimer > 0) this.punchTimer -= dt;

    if (this.car) {
      // Driving: throttle from W/S, steering from A/D, handbrake Space.
      const axes = input.moveAxes();
      const throttle = axes.f;
      const steer = -axes.s;
      this.car.drive(dt, throttle, steer, this.city, cars);
      this.person.group.visible = false;
      return;
    }

    // On foot.
    const axes = input.moveAxes();
    const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = run ? 9 : 5;
    const moving = axes.f !== 0 || axes.s !== 0;
    if (moving) {
      const fx = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
      const rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw);
      let mx = fx * axes.f + rx * axes.s;
      let mz = fz * axes.f + rz * axes.s;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;
      this.x += mx * speed * dt;
      this.z += mz * speed * dt;
      const fixed = this.city.resolveCircle(this.x, this.z, 0.7);
      this.x = fixed.x; this.z = fixed.z;
      this.heading = Math.atan2(mx, mz);
      this.walkPhase += dt * speed * 1.6;
      animateWalk(this.person, this.walkPhase, run ? 1 : 0.7);
    } else {
      resetPose(this.person);
    }

    // Jump.
    if (input.isDown('Space') && this.onGround) {
      this.vy = 7.5;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    }

    // Enter a nearby car with E.
    if (input.isDown('KeyE')) {
      let best = null, bestD = 4.2;
      for (const car of cars) {
        if (car.isPolice) continue;
        const d = distance2D(this.x, this.z, car.x, car.z);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (best) {
        this.car = best;
        best.isPlayer = true;
        this.person.group.visible = false;
        onEnterCar(best);
      }
    }

    this.person.group.position.set(this.x, 0.3 + this.y, this.z);
    this.person.group.rotation.y = this.heading;
    if (this.punchTimer > 0) {
      this.person.armR.rotation.x = -1.6 * Math.sin((this.punchTimer / 0.25) * Math.PI);
    }
  }

  exitCar() {
    if (!this.car) return null;
    const car = this.car;
    car.isPlayer = false;
    // Step out to the car's left side.
    const sx = car.x + Math.cos(car.heading) * 2.4;
    const sz = car.z - Math.sin(car.heading) * 2.4;
    const fixed = this.city.resolveCircle(sx, sz, 0.7);
    this.x = fixed.x; this.z = fixed.z;
    this.y = 0;
    this.car = null;
    this.person.group.visible = true;
    this.person.group.position.set(this.x, 0.3, this.z);
    return car;
  }

  punch(police) {
    if (this.punchCooldown > 0 || this.car) return false;
    this.punchCooldown = 0.45;
    this.punchTimer = 0.25;
    // Hit whatever is in front within 2.2 units.
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let hit = false;
    for (const cop of police.cops) {
      const dx = cop.x - this.x, dz = cop.z - this.z;
      if (dx * fx + dz * fz > 0 && Math.hypot(dx, dz) < 2.4) {
        cop.health -= 34;
        hit = true;
      }
    }
    return hit;
  }
}
