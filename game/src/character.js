// Neon Bay — low-poly people: a person is a small group of boxes (torso, head,
// arms, legs) so the player, pedestrians and police all read as characters at
// a glance, with a walk-cycle swing on the limbs.

import * as THREE from 'three';

export function makePerson({ shirt = 0x3a6fd8, pants = 0x2a2d33, skin = 0xc98d64, hair = 0x1a1a1a, scale = 1 } = {}) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: hair });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.38), skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);

  const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.42), hairMat);
  hairMesh.position.y = 1.96;
  g.add(hairMesh);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.2), shirtMat);
  armL.position.set(-0.42, 1.14, 0);
  armL.geometry.translate(0, -0.3, 0);
  armL.castShadow = true;
  g.add(armL);

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.2), shirtMat);
  armR.position.set(0.42, 1.14, 0);
  armR.geometry.translate(0, -0.3, 0);
  armR.castShadow = true;
  g.add(armR);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.24), pantsMat);
  legL.position.set(-0.16, 0.76, 0);
  legL.geometry.translate(0, -0.36, 0);
  legL.castShadow = true;
  g.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.24), pantsMat);
  legR.position.set(0.16, 0.76, 0);
  legR.geometry.translate(0, -0.36, 0);
  legR.castShadow = true;
  g.add(legR);

  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, armL, armR, legL, legR };
}

export function animateWalk(person, phase, speed01) {
  const swing = Math.sin(phase) * 0.7 * speed01;
  person.legL.rotation.x = swing;
  person.legR.rotation.x = -swing;
  person.armL.rotation.x = -swing * 0.8;
  person.armR.rotation.x = swing * 0.8;
}

export function resetPose(person) {
  person.legL.rotation.x = 0;
  person.legR.rotation.x = 0;
  person.armL.rotation.x = 0;
  person.armR.rotation.x = 0;
}
