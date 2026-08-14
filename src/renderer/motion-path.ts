import type { MotionPathDef } from '../types';

interface PathResult {
  x: number;
  y: number;
  angle: number; // radians, tangent direction
}

/**
 * Evaluate a position along a motion path at progress t (0–1).
 * Each segment between consecutive points is a cubic bezier or line.
 */
export function evaluateMotionPath(
  path: MotionPathDef,
  t: number,
): PathResult {
  const pts = path.points;
  if (pts.length === 0) return { x: 0, y: 0, angle: 0 };
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, angle: 0 };

  // Handle looping
  if (path.loop) {
    t = t % 1;
    if (t < 0) t += 1;
  } else {
    t = Math.max(0, Math.min(1, t));
  }

  const segments = pts.length - 1;
  const segProgress = t * segments;
  const segIndex = Math.min(Math.floor(segProgress), segments - 1);
  const segT = segProgress - segIndex;

  const p0 = pts[segIndex];
  const p1 = pts[segIndex + 1];

  // If either point has control points, use cubic bezier
  const hasCP0 = p0.cpX !== undefined && p0.cpY !== undefined;
  const hasCP1 = p1.cpX !== undefined && p1.cpY !== undefined;

  if (hasCP0 || hasCP1) {
    // Cubic bezier: P0 → CP0 → CP1 → P1
    // If one CP missing, use midpoint as default
    const cp0x = hasCP0 ? p0.cpX! : (p0.x + p1.x) / 2;
    const cp0y = hasCP0 ? p0.cpY! : (p0.y + p1.y) / 2;
    const cp1x = hasCP1 ? p1.cpX! : (p0.x + p1.x) / 2;
    const cp1y = hasCP1 ? p1.cpY! : (p0.y + p1.y) / 2;

    const x = cubicBezier(p0.x, cp0x, cp1x, p1.x, segT);
    const y = cubicBezier(p0.y, cp0y, cp1y, p1.y, segT);

    // Tangent (derivative)
    const dx = cubicBezierDeriv(p0.x, cp0x, cp1x, p1.x, segT);
    const dy = cubicBezierDeriv(p0.y, cp0y, cp1y, p1.y, segT);
    const angle = Math.atan2(dy, dx);

    return { x, y, angle };
  }

  // Linear interpolation
  const x = p0.x + (p1.x - p0.x) * segT;
  const y = p0.y + (p1.y - p0.y) * segT;
  const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);

  return { x, y, angle };
}

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function cubicBezierDeriv(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}
