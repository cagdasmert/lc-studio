import type { EasingType, EasingParams } from '../types';

const { PI, sin, cos, sqrt, pow, abs, min } = Math;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * PI) / 3;
const c5 = (2 * PI) / 4.5;

// ── Standard easings ───────────────────────────────────

// Quadratic
export const easeIn = (t: number) => t * t;
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2;

// Sine
export const easeInSine = (t: number) => 1 - cos((t * PI) / 2);
export const easeOutSine = (t: number) => sin((t * PI) / 2);
export const easeInOutSine = (t: number) => -(cos(PI * t) - 1) / 2;

// Cubic
export const easeInCubic = (t: number) => t * t * t;
export const easeOutCubic = (t: number) => 1 - pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;

// Exponential
export const easeInExpo = (t: number) => (t === 0 ? 0 : pow(2, 10 * t - 10));
export const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - pow(2, -10 * t));
export const easeInOutExpo = (t: number) =>
  t === 0 ? 0 : t === 1 ? 1
  : t < 0.5 ? pow(2, 20 * t - 10) / 2
  : (2 - pow(2, -20 * t + 10)) / 2;

// Circular
export const easeInCirc = (t: number) => 1 - sqrt(1 - pow(t, 2));
export const easeOutCirc = (t: number) => sqrt(1 - pow(t - 1, 2));
export const easeInOutCirc = (t: number) =>
  t < 0.5
    ? (1 - sqrt(1 - pow(2 * t, 2))) / 2
    : (sqrt(1 - pow(-2 * t + 2, 2)) + 1) / 2;

// Back
export const easeInBack = (t: number) => c3 * t * t * t - c1 * t * t;
export const easeOutBack = (t: number) =>
  1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2);
export const easeInOutBack = (t: number) =>
  t < 0.5
    ? (pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;

// Elastic
export const easeInElastic = (t: number) =>
  t === 0 ? 0 : t === 1 ? 1 : -pow(2, 10 * t - 10) * sin((t * 10 - 10.75) * c4);
export const easeOutElastic = (t: number) =>
  t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * sin((t * 10 - 0.75) * c4) + 1;
export const easeInOutElastic = (t: number) =>
  t === 0 ? 0 : t === 1 ? 1
  : t < 0.5
    ? -(pow(2, 20 * t - 10) * sin((20 * t - 11.125) * c5)) / 2
    : (pow(2, -20 * t + 10) * sin((20 * t - 11.125) * c5)) / 2 + 1;

// Bounce
function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}
export const easeInBounce = (t: number) => 1 - bounceOut(1 - t);
export const easeOutBounce = bounceOut;
export const easeInOutBounce = (t: number) =>
  t < 0.5
    ? (1 - bounceOut(1 - 2 * t)) / 2
    : (1 + bounceOut(2 * t - 1)) / 2;

// ── Parameterized easings ──────────────────────────────

export function cubicBezier(
  t: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  // Newton-Raphson to solve for the parameter u where bezierX(u) = t
  // then return bezierY(u)
  let u = t;
  for (let i = 0; i < 8; i++) {
    const xU = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (abs(dx) < 1e-6) break;
    u -= (xU - t) / dx;
    u = min(1, Math.max(0, u));
  }
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
}

export function steps(t: number, stepCount: number): number {
  return Math.floor(t * stepCount) / stepCount;
}

export function spring(
  t: number,
  mass: number = 1,
  stiffness: number = 100,
  damping: number = 10,
): number {
  // Damped harmonic oscillator: underdamped case
  const omega0 = sqrt(stiffness / mass);
  const zeta = damping / (2 * sqrt(stiffness * mass));

  if (zeta >= 1) {
    // Overdamped / critically damped — simple exponential approach
    return 1 - Math.exp(-omega0 * t) * (1 + omega0 * t);
  }

  // Underdamped
  const omegaD = omega0 * sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega0 * t) *
    (cos(omegaD * t) + (zeta * omega0 / omegaD) * sin(omegaD * t));
}

// ── Dispatcher ─────────────────────────────────────────

const EASING_MAP: Record<string, (t: number) => number> = {
  'linear': (t) => t,
  'ease-in': easeIn,
  'ease-out': easeOut,
  'ease-in-out': easeInOut,
  'ease-in-cubic': easeInCubic,
  'ease-out-cubic': easeOutCubic,
  'ease-in-out-cubic': easeInOutCubic,
  'ease-in-sine': easeInSine,
  'ease-out-sine': easeOutSine,
  'ease-in-out-sine': easeInOutSine,
  'ease-in-expo': easeInExpo,
  'ease-out-expo': easeOutExpo,
  'ease-in-out-expo': easeInOutExpo,
  'ease-in-circ': easeInCirc,
  'ease-out-circ': easeOutCirc,
  'ease-in-out-circ': easeInOutCirc,
  'ease-in-back': easeInBack,
  'ease-out-back': easeOutBack,
  'ease-in-out-back': easeInOutBack,
  'ease-in-elastic': easeInElastic,
  'ease-out-elastic': easeOutElastic,
  'ease-in-out-elastic': easeInOutElastic,
  'ease-in-bounce': easeInBounce,
  'ease-out-bounce': easeOutBounce,
  'ease-in-out-bounce': easeInOutBounce,
};

export function getEasing(
  name: EasingType,
  params?: EasingParams,
): (t: number) => number {
  if (name === 'cubic-bezier' && params?.controlPoints) {
    const [x1, y1, x2, y2] = params.controlPoints;
    return (t) => cubicBezier(t, x1, y1, x2, y2);
  }
  if (name === 'steps' && params?.steps) {
    const count = params.steps;
    return (t) => steps(t, count);
  }
  if (name === 'spring') {
    const m = params?.mass ?? 1;
    const s = params?.stiffness ?? 100;
    const d = params?.damping ?? 10;
    return (t) => spring(t, m, s, d);
  }
  return EASING_MAP[name] ?? EASING_MAP['linear'];
}
