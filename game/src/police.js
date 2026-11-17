// Neon Bay — wanted system and the Bay PD: stars 0–5, police cars and foot
// cops spawn at the city edge and chase the player, ramming on wheels and
// tackling on foot. Wanted decays when no cop can see the player; getting
// caught on foot with a cop close by gets you BUSTED.

import * as THREE from 'three';
import { clamp, distance2D, pick } from './util.js';
import { makePerson, animateWalk } from './character.js';
import { Car } from './vehicles.js';
import { CITY } from './city.js';

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.decayTimer = 0;
    this.cars = [];
    this.cops = [];
    this.arrestProgress = 0;
    this.maxCops = 0;
    this.spawnTimer = 0;
  }

  addWanted(n) {
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.wantedTimer = 0;
    this.decayTimer = 0;
  }

  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.wantedTimer = 0;
    this.decayTimer = 0;
  }

  desiredUnits() {
    return this.wanted === 0 ? 0 : this.wanted <= 1 ? 1 : this.wanted <= 2 ? 2 : this.wanted <= 3 ? 3 : this.wanted <= 4 ? 4 : 6;
  }

  spawnUnit(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const r = CITY.half * 0.8;
    const x = clamp(playerPos.x + Math.sin(angle) * 60, -CITY.half, CITY.half);
    const z = clamp(playerPos.z + Math.cos(angle) * 60, -CITY.half, CITY.half);
    if (this.wanted >= 2 && this.cars.length < Math.ceil(this.desiredUnits() / 2)) {
      const car = new Car(this.scene, x, z, Math.atan2(playerPos.x - x, playerPos.z - z), 0x11131a, { police: true, topSpeed: 24 + this.wanted * 1.5 });
      this.cars.push(car);
    } else {
      const person = makePerson({ shirt: 0x1a2a5a, pants: 0x11131a, skin: 0xc98d64, hair: 0x0a0a0a });
      person.group.position.set(x, 0.3, z);
      this.scene.add(person.group);
      this.cops.push({ person, x, z, heading: 0, health: 100, phase: 0, speed: 6.5 + this.wanted * 0.4 });
    }
  }

  removeFarUnits(playerPos) {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (distance2D(c.x, c.z, playerPos.x, playerPos.z) > 220) {
        this.scene.remove(c.mesh.group);
        this.cars.splice(i, 1);
      }
    }
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      if (distance2D(c.x, c.z, playerPos.x, playerPos.z) > 180) {
        this.scene.remove(c.person.group);
        this.cops.splice(i, 1);
      }
    }
  }

  update(dt, player, allCars, onBusted) {
    const pos = player.position;
    // Spawn to match the wanted level.
    this.spawnTimer -= dt;
    const want = this.desiredUnits();
    const have = this.cars.length + this.cops.length;
    if (this.wanted > 0 && have < want && this.spawnTimer <= 0) {
      this.spawnUnit(pos);
      this.spawnTimer = 1.2;
    }
    if (this.wanted === 0) {
      // Stand down: units drive off / walk away and despawn.
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        c.speed += (18 - c.speed) * dt;
        c.heading += 0.4 * dt;
        c.moveWithCollision(dt, this.city, allCars);
        c.updateMesh(dt);
        if (distance2D(c.x, c.z, pos.x, pos.z) > 120) {
          this.scene.remove(c.mesh.group);
          this.cars.splice(i, 1);
        }
      }
      for (let i = this.cops.length - 1; i >= 0; i--) {
        const c = this.cops[i];
        this.scene.remove(c.person.group);
        this.cops.splice(i, 1);
      }
      this.arrestProgress = 0;
      return;
    }

    // Wanted decay: out of sight of every unit for 20s loses a star.
    let seen = false;
    for (const c of this.cars) if (distance2D(c.x, c.z, pos.x, pos.z) < 55) seen = true;
    for (const c of this.cops) if (distance2D(c.x, c.z, pos.x, pos.z) < 35) seen = true;
    if (!seen) {
      this.decayTimer += dt;
      if (this.decayTimer > 20) {
        this.wanted -= 1;
        this.decayTimer = 0;
      }
    } else {
      this.decayTimer = 0;
    }

    // Police cars chase and ram.
    for (const car of this.cars) {
      const dx = pos.x - car.x, dz = pos.z - car.z;
      const dist = Math.hypot(dx, dz) || 1;
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += clamp(dh, -1.8 * dt, 1.8 * dt);
      const targetSpeed = dist < 6 ? 6 : car.topSpeed;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
      car.moveWithCollision(dt, this.city, allCars);
      car.updateMesh(dt);
      // Ram the player's car or knock the player down.
      if (dist < 4.5) {
        if (player.car) {
          player.car.speed *= 0.92;
          player.car.health -= 6 * dt;
        } else {
          player.damage(12 * dt);
        }
      }
    }

    // Foot cops chase and tackle.
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      if (cop.health <= 0) {
        this.scene.remove(cop.person.group);
        this.cops.splice(i, 1);
        player.money += 25;
        continue;
      }
      const dx = pos.x - cop.x, dz = pos.z - cop.z;
      const dist = Math.hypot(dx, dz) || 1;
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - cop.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      cop.heading += clamp(dh, -3.5 * dt, 3.5 * dt);
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      const fixed = this.city.resolveCircle(cop.x, cop.z, 0.6);
      cop.x = fixed.x; cop.z = fixed.z;
      cop.phase += dt * cop.speed * 2.4;
      animateWalk(cop.person, cop.phase, 1);
      cop.person.group.position.set(cop.x, 0.3, cop.z);
      cop.person.group.rotation.y = cop.heading;
      // Tackle / arrest on foot.
      if (!player.car && dist < 2.2) {
        this.arrestProgress += dt;
        player.damage(8 * dt);
        if (this.arrestProgress > 2.5) {
          onBusted();
          return;
        }
      } else {
        this.arrestProgress = Math.max(0, this.arrestProgress - dt * 0.7);
      }
    }

    this.removeFarUnits(pos);
  }

  clear() {
    for (const c of this.cars) this.scene.remove(c.mesh.group);
    for (const c of this.cops) this.scene.remove(c.person.group);
    this.cars = [];
    this.cops = [];
    this.wanted = 0;
    this.arrestProgress = 0;
  }
}
