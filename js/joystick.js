export const JOYSTICK_RADIUS = 60, JOYSTICK_DEAD_ZONE = 0.12;

export function joystickVector(dx, dy) {
  const distance = Math.hypot(dx, dy), fraction = distance / JOYSTICK_RADIUS;
  if (fraction <= JOYSTICK_DEAD_ZONE) return [0, 0];
  const strength = Math.min(1, (fraction - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE));
  return [dx / distance * strength, -dy / distance * strength];
}

// Capture only the steering finger; skill/dash keep their own independent pointers.
export function bindJoystick(area, { mode = 'floating', onChange, onRelease }) {
  const ring = area.querySelector('.joy'), knob = ring.querySelector('.joy-knob');
  let pointer = null, origin = null;
  function stop(notify = true) {
    const previous = pointer;
    pointer = origin = null;
    area.classList.remove('active');
    knob.style.transform = '';
    ring.hidden = mode !== 'fixed';
    if (previous !== null && area.hasPointerCapture(previous)) area.releasePointerCapture(previous);
    onChange([0, 0]);
    if (notify && previous !== null) onRelease();
  }
  function move(event) {
    if (event.pointerId !== pointer || !origin) return;
    const vector = joystickVector(event.clientX - origin[0], event.clientY - origin[1]);
    onChange(vector);
    knob.style.transform = `translate(${vector[0] * 40}px, ${-vector[1] * 40}px)`;
  }
  function down(event) {
    if (mode === 'tilt' || pointer !== null || event.button > 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    if (mode === 'fixed') {
      const bounds = ring.getBoundingClientRect();
      origin = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
    } else {
      const bounds = area.getBoundingClientRect();
      origin = [event.clientX, event.clientY];
      ring.style.left = `${origin[0] - bounds.left}px`;
      ring.style.top = `${origin[1] - bounds.top}px`;
    }
    area.setPointerCapture(pointer);
    area.classList.add('active'); ring.hidden = false;
    move(event);
  }
  const end = event => { if (event.pointerId === pointer) stop(); };
  const blur = () => stop();
  const visibility = () => { if (document.hidden) stop(); };
  area.addEventListener('pointerdown', down);
  area.addEventListener('pointermove', move);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) area.addEventListener(event, end);
  window.addEventListener('blur', blur);
  window.addEventListener('resize', blur);
  document.addEventListener('visibilitychange', visibility);
  function setMode(value) {
    stop(); mode = value; area.dataset.steering = mode;
    ring.style.left = ring.style.top = '';
    ring.hidden = mode !== 'fixed';
  }
  setMode(mode);
  return {
    setMode,
    dispose() {
      stop(false);
      area.removeEventListener('pointerdown', down); area.removeEventListener('pointermove', move);
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) area.removeEventListener(event, end);
      window.removeEventListener('blur', blur); window.removeEventListener('resize', blur);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
