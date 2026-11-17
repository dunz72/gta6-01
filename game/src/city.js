// Neon Bay — procedural city: a 5x5 block grid of streets, sidewalks, buildings,
// lamps and trees, built from boxes with a canvas window texture. Exports the
// collision boxes, the road network traffic follows, and sidewalk waypoints for
// pedestrians. Deterministic for a given seed.

import * as THREE from 'three';
import { mulberry32, pick } from './util.js';

export const CITY = {
  blocks: 5,
  block: 44,
  road: 14,
  half: 152,
};

export function roadLines() {
  const lines = [];
  const step = CITY.block + CITY.road;
  for (let k = 0; k <= CITY.blocks; k++) {
    const c = -CITY.half + k * step + CITY.road / 2 - 7;
    lines.push(c);
  }
  return lines;
}

function makeWindowTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#39415a';
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      const lit = random() < 0.5;
      g.fillStyle = lit ? (random() < 0.5 ? '#ffd97a' : '#9fe8ff') : '#232a3d';
      g.fillRect(x, y, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.random = mulberry32(seed);
    this.colliders = []; // {x, z, hx, hz}
    this.roads = []; // {axis: 'x'|'z', at, from, to}
    this.sidewalkSpots = [];
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);
    this.build();
  }

  build() {
    const random = this.random;
    const { blocks, block, road, half } = CITY;
    const step = block + road;

    // Ground: asphalt everywhere, then grass/sidewalk blocks on top.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 60, half * 2 + 60),
      new THREE.MeshLambertMaterial({ color: 0x2a2d33 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Dusk sky gradient + sun glow via scene fog and a big gradient dome handled in main.
    // Sidewalk slabs per block.
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x8a8d94 });
    const curbMat = new THREE.MeshLambertMaterial({ color: 0x55585f });
    const roadMarkMat = new THREE.MeshLambertMaterial({ color: 0xd8c95a });

    // Road network: grid lines both directions.
    const lines = roadLines();
    for (const c of lines) {
      this.roads.push({ axis: 'x', at: c, from: -half, to: half });
      this.roads.push({ axis: 'z', at: c, from: -half, to: half });
      // Dashed centre lines along each road.
      for (let t = -half + 8; t < half; t += 16) {
        const dashX = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 0.5), roadMarkMat);
        dashX.position.set(t, 0.03, c);
        this.group.add(dashX);
        const dashZ = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 6), roadMarkMat);
        dashZ.position.set(c, 0.03, t);
        this.group.add(dashZ);
      }
    }

    const winTex = makeWindowTexture(random);
    const palette = [0x5a6b8a, 0x7a5a6b, 0x4a7a6b, 0x8a7a4a, 0x6b5a8a, 0x3f5a7a, 0x9a6a4a, 0x54627a];
    const neonColors = [0xff2d78, 0x00e5ff, 0xffd23f, 0x7dff5e, 0xb967ff];

    for (let bx = 0; bx < blocks; bx++) {
      for (let bz = 0; bz < blocks; bz++) {
        const cx = -half + road + block / 2 + bx * step;
        const cz = -half + road + block / 2 + bz * step;
        // Sidewalk slab.
        const slab = new THREE.Mesh(new THREE.BoxGeometry(block + 2, 0.3, block + 2), sidewalkMat);
        slab.position.set(cx, 0.15, cz);
        slab.receiveShadow = true;
        this.group.add(slab);
        const curb = new THREE.Mesh(new THREE.BoxGeometry(block + 3, 0.32, block + 3), curbMat);
        curb.position.set(cx, 0.1, cz);
        this.group.add(curb);

        // 2x2 buildings per block, each with a neon sign strip on some.
        const spots = [
          [-block / 4, -block / 4], [block / 4, -block / 4],
          [-block / 4, block / 4], [block / 4, block / 4],
        ];
        for (const [ox, oz] of spots) {
          const w = 12 + random() * 6;
          const d = 12 + random() * 6;
          const h = 8 + random() * random() * 34;
          const color = pick(random, palette);
          const mat = new THREE.MeshLambertMaterial({ color, map: winTex });
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(cx + ox, h / 2 + 0.3, cz + oz);
          b.castShadow = true;
          b.receiveShadow = true;
          this.group.add(b);
          this.colliders.push({ x: cx + ox, z: cz + oz, hx: w / 2 + 0.3, hz: d / 2 + 0.3 });
          // Roof edge trim.
          const trim = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
            new THREE.MeshLambertMaterial({ color: 0x22242c }),
          );
          trim.position.set(cx + ox, h + 0.55, cz + oz);
          this.group.add(trim);
          // Neon sign on some buildings.
          if (random() < 0.45) {
            const sign = new THREE.Mesh(
              new THREE.BoxGeometry(0.4, 1.2, Math.min(w, 8)),
              new THREE.MeshBasicMaterial({ color: pick(random, neonColors) }),
            );
            sign.position.set(cx + ox + w / 2 + 0.25, Math.min(h * 0.7, 14), cz + oz);
            this.group.add(sign);
          }
        }

        // Trees on the block corners.
        for (const [ox, oz] of [[-block / 2 + 3, -block / 2 + 3], [block / 2 - 3, block / 2 - 3]]) {
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.45, 3, 6),
            new THREE.MeshLambertMaterial({ color: 0x5a3a22 }),
          );
          trunk.position.set(cx + ox, 1.8, cz + oz);
          this.group.add(trunk);
          const top = new THREE.Mesh(
            new THREE.SphereGeometry(2.2, 8, 6),
            new THREE.MeshLambertMaterial({ color: 0x2e7a3a }),
          );
          top.position.set(cx + ox, 4.6, cz + oz);
          top.castShadow = true;
          this.group.add(top);
        }

        // Sidewalk waypoints for pedestrians (block perimeter).
        this.sidewalkSpots.push({ x: cx - block / 2 + 2, z: cz - block / 2 + 2 });
        this.sidewalkSpots.push({ x: cx + block / 2 - 2, z: cz + block / 2 - 2 });
        this.sidewalkSpots.push({ x: cx - block / 2 + 2, z: cz + block / 2 - 2 });
        this.sidewalkSpots.push({ x: cx + block / 2 - 2, z: cz - block / 2 + 2 });
      }
    }

    // Street lamps at intersections.
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (const x of lines) {
      for (const z of lines) {
        if (random() < 0.55) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), lampMat);
        pole.position.set(x + 6.5, 3.5, z + 6.5);
        this.group.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampGlow);
        bulb.position.set(x + 6.5, 7.1, z + 6.5);
        this.group.add(bulb);
        // Real lights are expensive: only a few lamps get one.
        if (random() < 0.18) {
          const light = new THREE.PointLight(0xffd97a, 12, 26, 1.8);
          light.position.set(x + 6.5, 7, z + 6.5);
          this.group.add(light);
        }
      }
    }

    // Water tower landmark at the city edge + a big neon billboard.
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 8, 10),
      new THREE.MeshLambertMaterial({ color: 0x7a4a3a }),
    );
    tower.position.set(-half - 8, 16, -half - 8);
    this.group.add(tower);
  }

  // Circle (x, z, radius) vs building AABBs: returns a corrected position.
  resolveCircle(x, z, radius) {
    let px = x, pz = z;
    for (const c of this.colliders) {
      const nx = Math.max(c.x - c.hx, Math.min(px, c.x + c.hx));
      const nz = Math.max(c.z - c.hz, Math.min(pz, c.z + c.hz));
      const dx = px - nx, dz = pz - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          px = nx + (dx / d) * radius;
          pz = nz + (dz / d) * radius;
        } else {
          pz = c.z + c.hz + radius;
        }
      }
    }
    return { x: px, z: pz };
  }

  insideCity(x, z) {
    return Math.abs(x) < CITY.half + 20 && Math.abs(z) < CITY.half + 20;
  }
}
