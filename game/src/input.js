// Harbor Run — input: keyboard state plus mouse steering.
// The game reads this module every tick; nothing else touches the DOM keys.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed since the last tick (edge)
    this.mouseX = 0;            // -1..1 across the canvas
    this.mouseY = 0;            // -1..1 down the canvas
    this.mouseActive = false;   // true while the pointer steers the plane
    this.mouseDown = false;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseActive = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouseY = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.mouseActive = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.mouseActive = true;
      if (e.button === 0) this.clicked = true;
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    canvas.addEventListener('mouseleave', () => { this.mouseActive = false; });
  }

  down(code) { return this.keys.has(code); }

  anyDown(codes) { return codes.some((c) => this.keys.has(c)); }

  // True once, on the tick after the key went down.
  wasPressed(code) { return this.pressed.has(code); }

  anyPressed(codes) { return codes.some((c) => this.pressed.has(c)); }

  // Call at the end of every tick so edges do not leak into the next one.
  endTick() {
    this.pressed.clear();
    this.clicked = false;
  }

  // Steering intent from the keyboard, -1..1 on each axis.
  // Positive pitch pulls the nose up; positive roll banks right.
  keyboardSteer() {
    let pitch = 0;
    let roll = 0;
    if (this.down('ArrowUp')) pitch += 1;
    if (this.down('ArrowDown')) pitch -= 1;
    if (this.down('ArrowLeft')) roll -= 1;
    if (this.down('ArrowRight')) roll += 1;
    if (this.down('KeyA')) roll -= 0.6;
    if (this.down('KeyD')) roll += 0.6;
    return { pitch, roll };
  }

  // Steering intent from the mouse: pointer offset from centre.
  // Positive pitch pulls up when the pointer is above centre.
  mouseSteer() {
    if (!this.mouseActive) return { pitch: 0, roll: 0 };
    return {
      pitch: -this.mouseY * 0.9,
      roll: this.mouseX * 0.9,
    };
  }

  // Rudder: Q/E nudge the nose without banking.
  rudder() {
    let r = 0;
    if (this.down('KeyQ')) r -= 1;
    if (this.down('KeyE')) r += 1;
    return r;
  }

  throttleDelta(dt) {
    let d = 0;
    if (this.down('KeyW')) d += 1;
    if (this.down('KeyS')) d -= 1;
    return d * dt * 0.55;
  }
}
