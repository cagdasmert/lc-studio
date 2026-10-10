import type { MotionPathDef, MotionPathPoint } from '../types';
import { getEasing } from './easing';

export interface PathResult {
  x: number;
  y: number;
  angle: number; // radians, tangent direction
}

/** Samples per segment in the arc-length table. Fixed, so output is deterministic. */
const ARC_SAMPLES = 48;

/**
 * Where a layer is on its motion path at `frameInLayer`: linear progress
 * through the layer's life, shaped by the path's easing, then placed on the
 * path by its timing mode.
 */
export function motionPathAt(
  path: MotionPathDef,
  frameInLayer: number,
  layerDuration: number,
): PathResult {
  const linear = layerDuration > 0 ? frameInLayer / layerDuration : 0;
  const t = getEasing(path.easing ?? 'linear', path.easingParams)(linear);
  return evaluateMotionPath(path, t);
}

/**
 * Evaluate a position along a motion path at progress t (already eased).
 * Each segment between consecutive points is a cubic bezier or a line.
 * Looping paths wrap t; open paths extrapolate along the end tangent when an
 * overshooting easing pushes t outside 0–1, so the overshoot stays visible.
 */
export function evaluateMotionPath(path: MotionPathDef, t: number): PathResult {
  const pts = path.points;
  if (pts.length === 0) return { x: 0, y: 0, angle: 0 };
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, angle: 0 };
  if (!Number.isFinite(t)) t = 0;

  if (path.loop) {
    t = t % 1;
    if (t < 0) t += 1;
  }

  return path.timing === 'constant-speed'
    ? evaluateConstantSpeed(pts, t)
    : evaluatePerSegment(pts, t);
}

/** Every segment gets an equal share of t — the original behaviour. */
function evaluatePerSegment(pts: MotionPathPoint[], t: number): PathResult {
  const segments = pts.length - 1;
  if (t < 0) {
    return extrapolate(pts, 0, 0, t * segments * arcTable(pts).lengths[0]);
  }
  if (t > 1) {
    const last = segments - 1;
    return extrapolate(pts, last, 1, (t - 1) * segments * arcTable(pts).lengths[last]);
  }
  const segProgress = t * segments;
  const segIndex = Math.min(Math.floor(segProgress), segments - 1);
  return pointOnSegment(pts, segIndex, segProgress - segIndex);
}

/** t is a share of the path's whole length. */
function evaluateConstantSpeed(pts: MotionPathPoint[], t: number): PathResult {
  const table = arcTable(pts);
  if (table.total === 0) return pointOnSegment(pts, 0, 0);

  const d = t * table.total;
  if (d <= 0) {
    const first = table.lengths.findIndex((l) => l > 0);
    return d < 0 ? extrapolate(pts, first, 0, d) : pointOnSegment(pts, first, 0);
  }
  if (d >= table.total) {
    const last = lastIndexWhere(table.lengths, (l) => l > 0);
    return d > table.total ? extrapolate(pts, last, 1, d - table.total) : pointOnSegment(pts, last, 1);
  }

  // The segment holding distance d. A zero-length segment never matches, as
  // d >= its start + 0 always moves past it.
  let i = 0;
  while (i < pts.length - 2 && d >= table.starts[i] + table.lengths[i]) i++;

  // Invert the segment's cumulative samples: find the interval holding d,
  // then interpolate the curve parameter within it.
  const local = d - table.starts[i];
  const cum = table.cumulative[i];
  let lo = 0;
  let hi = ARC_SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= local) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const frac = span > 0 ? (local - cum[lo]) / span : 0;
  return pointOnSegment(pts, i, (lo + frac) / ARC_SAMPLES);
}

function lastIndexWhere(values: number[], test: (v: number) => boolean): number {
  for (let i = values.length - 1; i >= 0; i--) if (test(values[i])) return i;
  return values.length - 1;
}

// ── Segment geometry ──────────────────────────────────

interface SegmentPoint {
  x: number;
  y: number;
  dx: number; // derivative with respect to the segment parameter
  dy: number;
}

/** Position and derivative on segment i (pts[i] → pts[i + 1]) at parameter u. */
function segmentAt(pts: MotionPathPoint[], i: number, u: number): SegmentPoint {
  const p0 = pts[i];
  const p1 = pts[i + 1];

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
    return {
      x: cubicBezier(p0.x, cp0x, cp1x, p1.x, u),
      y: cubicBezier(p0.y, cp0y, cp1y, p1.y, u),
      dx: cubicBezierDeriv(p0.x, cp0x, cp1x, p1.x, u),
      dy: cubicBezierDeriv(p0.y, cp0y, cp1y, p1.y, u),
    };
  }

  // Linear interpolation
  return {
    x: p0.x + (p1.x - p0.x) * u,
    y: p0.y + (p1.y - p0.y) * u,
    dx: p1.x - p0.x,
    dy: p1.y - p0.y,
  };
}

function pointOnSegment(pts: MotionPathPoint[], i: number, u: number): PathResult {
  const s = segmentAt(pts, i, u);
  return { x: s.x, y: s.y, angle: Math.atan2(s.dy, s.dx) };
}

/**
 * Continue straight on from segment i at parameter u (0 = its start, 1 = its
 * end) for `distance` px along its tangent; negative goes backwards.
 */
function extrapolate(pts: MotionPathPoint[], i: number, u: number, distance: number): PathResult {
  const s = segmentAt(pts, i, u);
  let dx = s.dx;
  let dy = s.dy;
  if (Math.hypot(dx, dy) < 1e-9) {
    // A control point sitting on the end point leaves no derivative there;
    // the chord still points the right way.
    dx = pts[i + 1].x - pts[i].x;
    dy = pts[i + 1].y - pts[i].y;
  }
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: s.x, y: s.y, angle: 0 };
  return {
    x: s.x + (dx / len) * distance,
    y: s.y + (dy / len) * distance,
    angle: Math.atan2(dy, dx),
  };
}

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function cubicBezierDeriv(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}

// ── Arc length ────────────────────────────────────────

interface ArcTable {
  /** cumulative[i][k]: distance from segment i's start to its sample k (k = 0…ARC_SAMPLES). */
  cumulative: Float64Array[];
  lengths: number[];
  /** Distance from the path's start to each segment's start. */
  starts: number[];
  total: number;
}

/**
 * Keyed by the points array. Store updates replace the array rather than
 * mutating it, so a changed path always gets a fresh table.
 */
const arcTables = new WeakMap<MotionPathPoint[], ArcTable>();

function arcTable(pts: MotionPathPoint[]): ArcTable {
  let table = arcTables.get(pts);
  if (!table) {
    table = buildArcTable(pts);
    arcTables.set(pts, table);
  }
  return table;
}

function buildArcTable(pts: MotionPathPoint[]): ArcTable {
  const cumulative: Float64Array[] = [];
  const lengths: number[] = [];
  const starts: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const cum = new Float64Array(ARC_SAMPLES + 1);
    let prev = segmentAt(pts, i, 0);
    for (let k = 1; k <= ARC_SAMPLES; k++) {
      const cur = segmentAt(pts, i, k / ARC_SAMPLES);
      cum[k] = cum[k - 1] + Math.hypot(cur.x - prev.x, cur.y - prev.y);
      prev = cur;
    }
    starts.push(total);
    lengths.push(cum[ARC_SAMPLES]);
    cumulative.push(cum);
    total += cum[ARC_SAMPLES];
  }
  return { cumulative, lengths, starts, total };
}
