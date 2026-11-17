// Neon Bay — deterministic screenshot states and self-test hooks.
// ?shot=start  — title screen over the dusk city (camera orbit).
// ?shot=drive  — the player driving down a boulevard, HUD on.
// ?shot=chase  — wanted level 3, two police cars in pursuit, player driving.
// ?shot=mission — mission 2 in progress: the red Comet GT parked uptown, player on foot.
// ?shot=foot   — the player on foot in a busy street with traffic and pedestrians.
// ?selftest=1  — after boot, run scripted checks and log PASS/FAIL lines.
// These states are also what the CDP playtest driver uses to verify systems.

export function applyShot(game, shot) {
  const g = game;
  if (shot === 'start') {
    g.state = 'menu';
    g.cameraMode = 'orbit';
    return;
  }
  // Every other shot starts the game running.
  g.startGame(false);
  if (shot === 'drive') {
    g.spawnPlayerInCar(22, -100, 0);
    g.cameraYaw = 0;
    g.input.keys.add('KeyW');
    g.hud.say('Vex', 'Neon Bay at dusk. The whole city is yours, Rex — if you can take it.', 6);
  } else if (shot === 'chase') {
    g.spawnPlayerInCar(22, 60, Math.PI);
    g.police.setWanted(3);
    g.spawnPoliceNearPlayer(2);
    // Stage the pursuit so it is IN FRAME: one unit alongside in the next
    // lane, one unit head-on up the road, both running the real chase AI.
    if (g.police.cars[0]) g.police.cars[0].setPosition(27, 48, Math.PI);
    if (g.police.cars[1]) g.police.cars[1].setPosition(22, 5, 0);
    g.input.keys.add('KeyW');
    g.hud.say('Vex', 'Three stars, Rex! Lose them or the Bay PD will box you in.', 6);
    g.hud.toast('WANTED — 3 STARS');
  } else if (shot === 'mission') {
    g.missions.setIndex(1);
    g.queueDialogue(g.missions.current());
    g.hud.setObjective(g.missions.current().objective);
    g.player.x = 80; g.player.z = -112;
    g.player.heading = Math.PI;
    g.player.person.group.position.set(80, 0.3, -112);
    g.player.person.group.rotation.y = g.player.heading;
    g.cameraYaw = Math.PI;
  } else if (shot === 'foot') {
    g.player.x = 22; g.player.z = 10;
    g.player.heading = Math.PI;
    g.player.person.group.position.set(22, 0.3, 10);
    g.cameraYaw = Math.PI;
    g.hud.say('Mara', 'On foot in the Bay. Keep your head down — and your pockets full.', 6);
  }
}

// Scripted self-test: drives the real systems and logs PASS/FAIL lines.
// Waits are measured in GAME time (g.time), so the test is valid even when
// software rendering runs the game slower than real time.
export async function runSelfTest(game) {
  const log = (name, ok, detail = '') => console.log(`[selftest] ${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitGame = async (g, seconds) => {
    const start = g.time;
    for (let i = 0; i < 400; i++) {
      if (g.time - start >= seconds) return;
      await sleep(100);
    }
  };
  const g = game;
  try {
    g.startGame(false);
    await sleep(300);
    log('boot', g.state === 'playing', `state=${g.state}`);

    // 1. On-foot movement (2 game-seconds of W) from a road position.
    g.debug.teleport(22, 10);
    const x0 = g.player.x, z0 = g.player.z;
    g.debug.keys.add('KeyW');
    await waitGame(g, 2);
    g.debug.keys.delete('KeyW');
    const moved = Math.hypot(g.player.x - x0, g.player.z - z0);
    log('move-on-foot', moved > 4, `moved=${moved.toFixed(2)}m`);

    // 2. Enter a car (hold E until seated, up to 4 real seconds).
    const car = g.debug.spawnCarNearPlayer();
    g.player.x = car.x + 2; g.player.z = car.z;
    g.debug.keys.add('KeyE');
    for (let i = 0; i < 40 && !g.player.car; i++) await sleep(100);
    g.debug.keys.delete('KeyE');
    log('enter-car', !!g.player.car, g.player.car ? 'in car' : 'not in car');

    // 3. Drive (2 game-seconds of W).
    const cx0 = g.player.car ? g.player.car.x : 0;
    const cz0 = g.player.car ? g.player.car.z : 0;
    g.debug.keys.add('KeyW');
    await waitGame(g, 2);
    g.debug.keys.delete('KeyW');
    const drove = g.player.car ? Math.hypot(g.player.car.x - cx0, g.player.car.z - cz0) : 0;
    log('drive', drove > 8, `drove=${drove.toFixed(2)}m`);

    // 4. Steal raises wanted.
    const w0 = g.police.wanted;
    log('steal-wanted', w0 >= 1, `wanted=${w0}`);

    // 5. Police spawn and chase.
    g.police.setWanted(3);
    await waitGame(g, 3);
    const units = g.police.cars.length + g.police.cops.length;
    log('police-spawn', units >= 1, `units=${units}`);

    // 6. Shoot the pistol.
    const ammo0 = g.player.ammo;
    g.player.exitCar();
    g.debug.shoot();
    await sleep(150);
    log('shoot', g.player.ammo === ammo0 - 1, `ammo ${ammo0}->${g.player.ammo}`);

    // 7. Mission progress: teleport to the marker of mission 1.
    g.missions.setIndex(0);
    const m = g.missions.current();
    g.player.x = m.marker.x; g.player.z = m.marker.z;
    await waitGame(g, 1);
    log('mission-complete', g.missions.index === 1, `mission=${g.missions.index}`);

    // 8. Minimap + HUD present.
    log('hud', !!document.getElementById('minimap') && !document.getElementById('hud').classList.contains('hidden'), 'hud visible');
    console.log('[selftest] DONE');
    window.__selftestDone = true;
  } catch (err) {
    console.log('[selftest] ERROR ' + (err && err.message));
    window.__selftestDone = true;
  }
}
