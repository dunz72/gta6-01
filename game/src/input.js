// Neon Bay — keyboard and mouse input.
// Tracks held keys, mouse-look deltas (pointer lock when available, drag fallback
// for headless/embedded play), and click events the combat system consumes.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.clicked = false;
    this.clickX = 0;
    this.clickY = 0;
    this.pointerLocked = false;
    this.canvas = canvas;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.clicked = true;
      this.clickX = e.clientX;
      this.clickY = e.clientY;
      if (document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch (_) { /* pointer lock unavailable */ }
      }
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      } else if (this.dragging) {
        this.lookDX += (e.clientX - this.lastX) * 2.2;
        this.lookDY += (e.clientY - this.lastY) * 2.2;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
  }

  isDown(code) { return this.keys.has(code); }

  consumeLook() {
    const dx = this.lookDX, dy = this.lookDY;
    this.lookDX = 0; this.lookDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  // Forward / strafe in [-1, 1] from WASD + arrows.
  moveAxes() {
    let f = 0, s = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) f += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) f -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) s += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) s -= 1;
    return { f, s };
  }
}
