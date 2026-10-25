// Fit a sphere around the arena with a normal lens; portrait screens move back.
export function arenaCameraDistance(aspect, fov, radius) {
  const halfAngle = Math.atan(Math.tan(fov * Math.PI / 360) * Math.min(1, Math.max(0.1, aspect)));
  return radius / Math.sin(halfAngle);
}
