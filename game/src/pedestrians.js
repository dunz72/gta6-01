// Neon Bay — pedestrians: people walking the sidewalks who pick a new corner
// when they arrive, and run away when gunfire goes off or a car comes at them.

import * as THREE from 'three';
import { clamp, distance2D, pick } from './util.js';
import { makePerson, animateWalk, resetPose } from './character.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c24a, 0x9a4ad8, 0xe8e8e8, 0x4ad8c2, 0xd87a4a];

export class Pedestrians {
  constructor(scene, city, count = 18) {
    this.scene = scene;
    this.city = city;
    this.people = [];
    for (let i = 0; i < count; i++) {
      const spot = pick(Math.random, city.sidewalkSpots);
      const person = makePerson({ shirt: pick(Math.random, SHIRTS), scale: 0.95 + Math.random() * 0.15 });
      const x = spot.x + (Math.random() * 6 - 3);
      const z = spot.z + (Math.random() * 6 - 3);
      person.group.position.set(x, 0.3, z);
      scene.add(person.group);
      this.people.push({
        person,
        x, z,
        heading: Math.random() * Math.PI * 2,
        speed: 1.2 + Math.random() * 1.1,
        target: pick(Math.random, city.sidewalkSpots),
        phase: Math.random() * 6,
        fleeing: 0,
        scared: false,
      });
    }
  }

  scareAt(x, z, radius) {
    for (const p of this.people) {
      if (distance2D(p.x, p.z, x, z) < radius) {
        p.fleeing = 2.5 + Math.random() * 2;
        p.scared = true;
      }
    }
  }

  update(dt, playerPos) {
    for (const p of this.people) {
      // Flee from the player when the player is speeding in a car nearby.
      if (playerPos && playerPos.inCar && distance2D(p.x, p.z, playerPos.x, playerPos.z) < 9) {
        p.fleeing = Math.max(p.fleeing, 1.5);
      }
      let tx, tz, speed;
      if (p.fleeing > 0) {
        p.fleeing -= dt;
        // Run away from the player.
        const dx = p.x - (playerPos ? playerPos.x : p.x);
        const dz = p.z - (playerPos ? playerPos.z : p.z);
        const d = Math.hypot(dx, dz) || 1;
        tx = p.x + (dx / d) * 20;
        tz = p.z + (dz / d) * 20;
        speed = 4.5;
      } else {
        tx = p.target.x; tz = p.target.z;
        speed = p.speed;
        if (distance2D(p.x, p.z, tx, tz) < 2) {
          p.target = pick(Math.random, this.city.sidewalkSpots);
        }
      }
      const dx = tx - p.x, dz = tz - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const targetHeading = Math.atan2(dx, dz);
        let dh = targetHeading - p.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        p.heading += clamp(dh, -3 * dt, 3 * dt);
        p.x += Math.sin(p.heading) * speed * dt;
        p.z += Math.cos(p.heading) * speed * dt;
        const fixed = this.city.resolveCircle(p.x, p.z, 0.6);
        p.x = fixed.x; p.z = fixed.z;
        p.phase += dt * speed * 3.2;
        animateWalk(p.person, p.phase, clamp(speed / 3, 0.2, 1));
      } else {
        resetPose(p.person);
      }
      p.person.group.position.set(p.x, 0.3, p.z);
      p.person.group.rotation.y = p.heading;
    }
  }
}
