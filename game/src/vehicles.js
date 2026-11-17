// Neon Bay — cars: box-built vehicles with a cabin, wheels and lights, plus the
// driving model (accel, brake/reverse, steering, AABB + car-car collision) and
// the traffic AI that drives the city's roads and turns at intersections.

import * as THREE from 'three';
import { clamp, distance2D, pick } from './util.js';
import { roadLines, CITY } from './city.js';

const CAR_COLORS = [0xc23b3b, 0x3b6fc2, 0x3bc25e, 0xd8c23a, 0x8a8f96, 0x2a2d33, 0xe8e8e8, 0x7a4ac2, 0x2aa8a0];

export function makeCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x11131a : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 2.2),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0xe8e8e8 : 0x1a2430 }),
  );
  cabin.position.set(0, 1.18, -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  // Hood + trunk accents.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.9), bodyMat);
  hood.position.set(0, 0.96, 1.7);
  g.add(hood);
  // Headlights and taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), lightMat);
    h.position.set(sx, 0.66, 2.22);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    t.position.set(sx, 0.66, -2.22);
    g.add(t);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  if (isPolice) {
    // White doors + light bar.
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.4, 2.4), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    door.position.set(0, 0.66, 0);
    g.add(door);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.55, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.32, 1.66, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.34), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.set(0.32, 1.66, -0.2);
    g.add(blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
  }
  return { group: g, wheels };
}

export class Car {
  constructor(scene, x, z, heading, color, opts = {}) {
    this.isPolice = !!opts.police;
    this.isPlayer = false;
    this.isTraffic = !!opts.traffic;
    this.isMission = !!opts.mission;
    this.stolen = false;
    this.speed = 0;
    this.steer = 0;
    this.heading = heading;
    this.x = x;
    this.z = z;
    this.radius = 2.1;
    this.health = 100;
    this.mesh = makeCarMesh(color, this.isPolice);
    this.mesh.group.position.set(x, 0, z);
    this.mesh.group.rotation.y = heading;
    scene.add(this.mesh.group);
    // Traffic AI state.
    this.wp = null;
    this.waitTimer = 0;
    this.topSpeed = opts.topSpeed ?? (this.isPolice ? 26 : 11 + Math.random() * 5);
  }

  setPosition(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.mesh.group.position.set(x, 0, z);
    this.mesh.group.rotation.y = heading;
  }

  // Player driving: forward/reverse throttle, steering, drag, and collisions.
  drive(dt, throttle, steerInput, city, cars) {
    const accel = 16;
    const maxForward = 30;
    const maxReverse = 10;
    if (throttle > 0) this.speed += accel * throttle * dt;
    else if (throttle < 0) this.speed += accel * throttle * dt * 0.9;
    else this.speed -= this.speed * 1.4 * dt;
    if (this.speed > maxForward) this.speed = maxForward;
    if (this.speed < -maxReverse) this.speed = -maxReverse;
    const steerTarget = steerInput * clamp(Math.abs(this.speed) / 8, 0, 1) * 0.55;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    this.heading += this.steer * (this.speed / 8) * dt * (this.speed >= 0 ? 1 : -1);
    this.moveWithCollision(dt, city, cars);
    this.updateMesh(dt);
  }

  moveWithCollision(dt, city, cars) {
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const fixed = city.resolveCircle(nx, nz, this.radius);
    const hitWall = Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01;
    this.x = fixed.x;
    this.z = fixed.z;
    if (hitWall) {
      if (Math.abs(this.speed) > 6) this.health -= 4;
      this.speed *= 0.45;
    }
    // Car-car push-apart.
    for (const other of cars) {
      if (other === this) continue;
      const d = distance2D(this.x, this.z, other.x, other.z);
      const min = this.radius + other.radius - 0.4;
      if (d < min && d > 0.001) {
        const push = (min - d) / 2;
        const ux = (this.x - other.x) / d, uz = (this.z - other.z) / d;
        this.x += ux * push; this.z += uz * push;
        other.x -= ux * push; other.z -= uz * push;
        if (Math.abs(this.speed) > 8 || Math.abs(other.speed) > 8) {
          this.health -= 2;
          this.speed *= 0.7;
          other.speed *= 0.7;
        }
      }
    }
    // Keep inside the city.
    this.x = clamp(this.x, -CITY.half - 18, CITY.half + 18);
    this.z = clamp(this.z, -CITY.half - 18, CITY.half + 18);
  }

  updateMesh(dt) {
    this.mesh.group.position.set(this.x, 0, this.z);
    this.mesh.group.rotation.y = this.heading;
    const spin = this.speed * dt * 2.6;
    for (const w of this.mesh.wheels) w.rotation.x += spin;
    if (this.isPolice && this.mesh.group.userData.lightRed) {
      const on = Math.sin(performance.now() * 0.02) > 0;
      this.mesh.group.userData.lightRed.material.color.setHex(on ? 0xff2222 : 0x551111);
      this.mesh.group.userData.lightBlue.material.color.setHex(on ? 0x112255 : 0x2266ff);
    }
  }
}

// Traffic manager: a fleet of AI cars cruising the road grid.
export class Traffic {
  constructor(scene, city, count = 14) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    const lines = roadLines();
    for (let i = 0; i < count; i++) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const at = pick(Math.random, lines);
      const along = (Math.random() * 2 - 1) * (CITY.half - 10);
      const heading = axis === 'x' ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI);
      const x = axis === 'x' ? along : at + (Math.random() < 0.5 ? 3.5 : -3.5);
      const z = axis === 'x' ? at + (Math.random() < 0.5 ? 3.5 : -3.5) : along;
      const car = new Car(scene, x, z, heading, pick(Math.random, CAR_COLORS), { traffic: true });
      car.wp = this.nextWaypoint(car);
      this.cars.push(car);
    }
  }

  nextWaypoint(car) {
    const lines = roadLines();
    // Drive along the current road to the next intersection, then maybe turn.
    const dirX = Math.sin(car.heading), dirZ = Math.cos(car.heading);
    const ahead = 40;
    let tx = car.x + dirX * ahead, tz = car.z + dirZ * ahead;
    // Snap the target onto the nearest road line in the driving direction.
    const nearest = lines.reduce((best, c) => (Math.abs(c - (Math.abs(dirX) > 0.5 ? car.z : car.x)) < Math.abs(best - (Math.abs(dirX) > 0.5 ? car.z : car.x)) ? c : best), lines[0]);
    if (Math.abs(dirX) > 0.5) tz = nearest + (car.z < nearest ? 3.5 : -3.5);
    else tx = nearest + (car.x < nearest ? 3.5 : -3.5);
    tx = clamp(tx, -CITY.half, CITY.half);
    tz = clamp(tz, -CITY.half, CITY.half);
    // Random turn at the intersection: pick a new heading 25% of the time.
    if (Math.random() < 0.3) {
      const turns = [0, Math.PI / 2, -Math.PI / 2];
      const turn = pick(Math.random, turns);
      const nh = car.heading + turn;
      return { x: car.x + Math.sin(nh) * 46, z: car.z + Math.cos(nh) * 46, heading: nh };
    }
    return { x: tx, z: tz, heading: car.heading };
  }

  update(dt, allCars) {
    for (const car of this.cars) {
      if (car.waitTimer > 0) { car.waitTimer -= dt; continue; }
      if (!car.wp) car.wp = this.nextWaypoint(car);
      const dx = car.wp.x - car.x, dz = car.wp.z - car.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += clamp(dh, -1.4 * dt, 1.4 * dt);
      const targetSpeed = dist < 6 ? 0 : car.topSpeed;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.6);
      if (dist < 5) {
        car.wp = this.nextWaypoint(car);
        if (Math.random() < 0.12) car.waitTimer = 1 + Math.random() * 2;
      }
      car.moveWithCollision(dt, this.city, allCars);
      car.updateMesh(dt);
    }
  }
}
