import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { ImageLayerData, ImageMorphDef, Layer, MorphPair, MorphPoint } from '../../types';
import { createMediaCache, loadImage } from '../../renderer/media-cache';
import { resolveAssetPath } from '../../lib/asset-manager';
import { boxToUv, fitRect, uvToBox, type Rect } from '../../renderer/fit';
import { MORPH_GRID, renderMorph } from '../../renderer/draw-morph';
import { buildMorphMesh, type MorphView } from '../../renderer/morph-field';
import { addPair, clearAuto, deletePair, mergeAuto, movePoint, newPairId } from '../../lib/morph-edit';
import {
  DEFAULT_VIEW, hitPoint, paneXf, toBox, toScreen, zoomAt, type PaneView, type PaneXf,
} from '../../lib/morph-pane';
import { autoMatch, autoMatchAvailable, ModelMissingError } from '../../lib/morph-match';

type Side = 'a' | 'b';
type PaneId = Side | 'mid';
const PANES: PaneId[] = ['a', 'mid', 'b'];

const COLORS = { high: '#2fb36b', low: '#e0a526', manual: '#4a7dff', ring: '#e94560' };
const DOT_R = 7;
const HIT_R = DOT_R + 3;
const DRAG_START_PX = 3;

type Drag =
  | { kind: 'point'; id: string; side: Side; sx: number; sy: number; moved: boolean }
  | { kind: 'pan'; pane: PaneId; sx: number; sy: number; view: PaneView };

function dotColor(p: MorphPair): string {
  if (p.source === 'manual') return COLORS.manual;
  return (p.confidence ?? 0) >= 0.6 ? COLORS.high : COLORS.low;
}

const clampUv = (p: MorphPoint): MorphPoint =>
  ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) });

function baseName(p: string): string {
  if (p.startsWith('data:')) return 'embedded image';
  return p.split(/[\\/]/).pop() || p;
}

/**
 * Three panes — A | live result | B — for placing and fixing the point pairs
 * of an image morph. Edits a draft; Done commits it as one undo step.
 */
export function MorphEditor({ layer, sceneIndex, onClose }: {
  layer: ImageLayerData;
  sceneIndex: number;
  onClose: () => void;
}) {
  const updateLayer = useStore((s) => s.updateLayer);
  const projectPath = useStore((s) => s.projectPath);

  const [draft, setDraft] = useState<ImageMorphDef>(() => structuredClone(layer.morph as ImageMorphDef));
  const [bitmaps, setBitmaps] = useState<{ a?: ImageBitmap; b?: ImageBitmap }>({});
  const [selected, setSelected] = useState<{ id: string; side: Side } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [t, setT] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [showMesh, setShowMesh] = useState(false);
  const [views, setViews] = useState<Record<PaneId, PaneView>>({ a: DEFAULT_VIEW, mid: DEFAULT_VIEW, b: DEFAULT_VIEW });
  const [sizes, setSizes] = useState<Record<PaneId, { w: number; h: number }>>({
    a: { w: 1, h: 1 }, mid: { w: 1, h: 1 }, b: { w: 1, h: 1 },
  });
  const [matching, setMatching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refA = useRef<HTMLCanvasElement>(null);
  const refMid = useRef<HTMLCanvasElement>(null);
  const refB = useRef<HTMLCanvasElement>(null);
  const refs: Record<PaneId, React.RefObject<HTMLCanvasElement | null>> = { a: refA, mid: refMid, b: refB };
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Images ──────────────────────────────────────────
  const target = layer.morph?.target ?? '';
  useEffect(() => {
    let cancelled = false;
    const cache = createMediaCache();
    (async () => {
      await Promise.all([layer.src, target].filter(Boolean).map(async (src) =>
        loadImage(cache, src, await resolveAssetPath(src, projectPath))));
      if (!cancelled) setBitmaps({ a: cache.get(layer.src), b: cache.get(target) });
    })();
    return () => { cancelled = true; };
  }, [layer.src, target, projectPath]);

  const view: MorphView | null = useMemo(() => {
    if (!bitmaps.a || !bitmaps.b) return null;
    return {
      fitMode: layer.fitMode,
      sizeA: { w: bitmaps.a.width, h: bitmaps.a.height },
      sizeB: { w: bitmaps.b.width, h: bitmaps.b.height },
      boxW: layer.width,
      boxH: layer.height,
    };
  }, [bitmaps, layer.fitMode, layer.width, layer.height]);

  const rectOf = (side: Side): Rect => {
    const v = view as MorphView;
    const size = side === 'a' ? v.sizeA : v.sizeB;
    return fitRect(v.fitMode, size.w, size.h, v.boxW, v.boxH);
  };
  const xfOf = (pane: PaneId): PaneXf => {
    const v = view as MorphView;
    return paneXf(sizes[pane].w, sizes[pane].h, v.boxW, v.boxH, views[pane]);
  };
  const screenPoints = (side: Side) => {
    const xf = xfOf(side);
    const r = rectOf(side);
    return draft.pairs.map((p) => ({ id: p.id, ...toScreen(xf, uvToBox(p[side], r)) }));
  };

  // ── Pane sizes ──────────────────────────────────────
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const next: Partial<Record<PaneId, { w: number; h: number }>> = {};
      for (const pane of PANES) {
        const c = refs[pane].current;
        if (!c) continue;
        c.width = Math.max(1, Math.round(c.clientWidth * dpr));
        c.height = Math.max(1, Math.round(c.clientHeight * dpr));
        next[pane] = { w: c.clientWidth, h: c.clientHeight };
      }
      setSizes((s) => ({ ...s, ...next }));
    });
    for (const pane of PANES) {
      const c = refs[pane].current;
      if (c) observer.observe(c);
    }
    return () => observer.disconnect();
    // The refs are stable; observe once.
  }, []);

  // ── Drawing (once per animation frame, after any state change) ─────
  useEffect(() => {
    const raf = requestAnimationFrame(drawAll);
    return () => cancelAnimationFrame(raf);
  });

  function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, p: MorphPair, n: number) {
    const r = hover === p.id ? DOT_R + 2 : DOT_R;
    if (selected?.id === p.id) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.ring;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = dotColor(p);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + 0.5);
  }

  /** Clear a pane; returns its context and transform once the images are in. */
  function beginPane(pane: PaneId): { ctx: CanvasRenderingContext2D; xf: PaneXf } | null {
    const c = refs[pane].current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sizes[pane].w, sizes[pane].h);
    if (!view) return null;
    return { ctx, xf: xfOf(pane) };
  }

  function outlineBox(ctx: CanvasRenderingContext2D, xf: PaneXf) {
    const v = view as MorphView;
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(xf.x, xf.y, v.boxW * xf.s, v.boxH * xf.s);
  }

  function drawSourcePane(side: Side) {
    const pane = beginPane(side);
    const bitmap = bitmaps[side];
    if (!pane || !bitmap || !view) return;
    const { ctx, xf } = pane;
    const r = rectOf(side);
    ctx.save();
    ctx.translate(xf.x, xf.y);
    ctx.scale(xf.s, xf.s);
    ctx.beginPath();
    ctx.rect(0, 0, view.boxW, view.boxH);
    ctx.clip();
    ctx.drawImage(bitmap, r.x, r.y, r.w, r.h);
    ctx.restore();
    outlineBox(ctx, xf);
    draft.pairs.forEach((p, i) => {
      const s = toScreen(xf, uvToBox(p[side], r));
      drawDot(ctx, s.x, s.y, p, i + 1);
    });
  }

  function drawResultPane() {
    const pane = beginPane('mid');
    if (!pane || !view || !bitmaps.a || !bitmaps.b) return;
    const { ctx, xf } = pane;
    const dpr = window.devicePixelRatio || 1;
    // Render at display resolution. 'none' pins the image to native pixels,
    // so only there must the box be rendered at full size.
    const k = view.fitMode === 'none' ? 1 : Math.min(1, xf.s * dpr);
    const out = renderMorph({
      a: bitmaps.a, b: bitmaps.b, fitMode: view.fitMode, pairs: draft.pairs, t,
      width: view.boxW * k, height: view.boxH * k,
    });
    ctx.save();
    ctx.translate(xf.x, xf.y);
    ctx.scale(xf.s, xf.s);
    ctx.drawImage(out, 0, 0, view.boxW, view.boxH);
    if (showMesh) drawMesh(ctx, xf.s);
    ctx.restore();
    outlineBox(ctx, xf);

    const sel = selected && draft.pairs.find((p) => p.id === selected.id);
    if (sel) {
      const a = uvToBox(sel.a, rectOf('a'));
      const b = uvToBox(sel.b, rectOf('b'));
      const s = toScreen(xf, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      ctx.beginPath();
      ctx.arc(s.x, s.y, DOT_R, 0, Math.PI * 2);
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = COLORS.ring;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Warped grid of image A; triangles that fold over are filled red. */
  function drawMesh(ctx: CanvasRenderingContext2D, scale: number) {
    const mesh = buildMorphMesh(view as MorphView, draft.pairs, t, MORPH_GRID);
    const { src, dstA: d, cols, rows } = mesh;
    const stride = cols + 1;
    const area = (v: Float64Array, i: number, j: number, k: number) =>
      (v[j] - v[i]) * (v[k + 1] - v[i + 1]) - (v[k] - v[i]) * (v[j + 1] - v[i + 1]);
    ctx.fillStyle = 'rgba(255, 60, 60, 0.45)';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i00 = (r * stride + c) * 2, i10 = i00 + 2, i01 = i00 + stride * 2, i11 = i01 + 2;
        for (const [i, j, k] of [[i00, i10, i11], [i00, i11, i01]]) {
          if (Math.sign(area(src, i, j, k)) !== Math.sign(area(d, i, j, k))) {
            ctx.beginPath();
            ctx.moveTo(d[i], d[i + 1]);
            ctx.lineTo(d[j], d[j + 1]);
            ctx.lineTo(d[k], d[k + 1]);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const i = (r * stride + c) * 2;
        if (c === 0) ctx.moveTo(d[i], d[i + 1]); else ctx.lineTo(d[i], d[i + 1]);
      }
    }
    for (let c = 0; c <= cols; c++) {
      for (let r = 0; r <= rows; r++) {
        const i = (r * stride + c) * 2;
        if (r === 0) ctx.moveTo(d[i], d[i + 1]); else ctx.lineTo(d[i], d[i + 1]);
      }
    }
    ctx.stroke();
  }

  function drawAll() {
    drawSourcePane('a');
    drawResultPane();
    drawSourcePane('b');
  }

  // ── Pointer input ───────────────────────────────────
  function local(e: React.PointerEvent | React.WheelEvent) {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  function onPointerDown(pane: PaneId, e: React.PointerEvent<HTMLCanvasElement>) {
    if (!view) return;
    const { sx, sy } = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || spaceRef.current || pane === 'mid') {
      dragRef.current = { kind: 'pan', pane, sx, sy, view: views[pane] };
      return;
    }
    if (e.button !== 0) return;
    const side = pane;
    const hit = hitPoint(screenPoints(side), sx, sy, HIT_R);
    if (hit) {
      setSelected({ id: hit, side });
      dragRef.current = { kind: 'point', id: hit, side, sx, sy, moved: false };
      return;
    }
    const uv = boxToUv(toBox(xfOf(side), sx, sy), rectOf(side));
    if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) return;
    const id = newPairId();
    setDraft((d) => ({ ...d, pairs: addPair(d.pairs, view, side, uv, id) }));
    setSelected({ id, side });
    dragRef.current = { kind: 'point', id, side, sx, sy, moved: true };
  }

  function onPointerMove(pane: PaneId, e: React.PointerEvent<HTMLCanvasElement>) {
    if (!view) return;
    const { sx, sy } = local(e);
    const drag = dragRef.current;
    if (drag?.kind === 'pan' && drag.pane === pane) {
      setViews((v) => ({
        ...v,
        [pane]: { ...drag.view, panX: drag.view.panX + sx - drag.sx, panY: drag.view.panY + sy - drag.sy },
      }));
      return;
    }
    if (drag?.kind === 'point' && drag.side === pane) {
      if (!drag.moved && Math.hypot(sx - drag.sx, sy - drag.sy) < DRAG_START_PX) return;
      drag.moved = true;
      const uv = clampUv(boxToUv(toBox(xfOf(drag.side), sx, sy), rectOf(drag.side)));
      setDraft((d) => ({ ...d, pairs: movePoint(d.pairs, drag.id, drag.side, uv) }));
      return;
    }
    if (pane !== 'mid') setHover(hitPoint(screenPoints(pane), sx, sy, HIT_R));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onWheel(pane: PaneId, e: React.WheelEvent<HTMLCanvasElement>) {
    if (!view) return;
    const { sx, sy } = local(e);
    const { w, h } = sizes[pane];
    const factor = Math.exp(-e.deltaY * 0.0015);
    setViews((v) => ({ ...v, [pane]: zoomAt(w, h, view.boxW, view.boxH, v[pane], sx, sy, factor) }));
  }

  // ── Keyboard (modal: nothing reaches the app's shortcuts while open) ──
  useEffect(() => {
    function nudge(dx: number, dy: number) {
      if (!selected || !view) return;
      const pair = draft.pairs.find((p) => p.id === selected.id);
      if (!pair) return;
      const xf = xfOf(selected.side);
      const r = rectOf(selected.side);
      const from = pair[selected.side];
      const to = clampUv({ x: from.x + dx / (xf.s * r.w), y: from.y + dy / (xf.s * r.h) });
      setDraft((d) => ({ ...d, pairs: movePoint(d.pairs, selected.id, selected.side, to) }));
    }
    function onKeyDown(e: KeyboardEvent) {
      e.stopPropagation();
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === ' ') { spaceRef.current = true; e.preventDefault(); return; }
      if (e.key === 'Escape') { cancel(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        setDraft((d) => ({ ...d, pairs: deletePair(d.pairs, selected.id) }));
        setSelected(null);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const dir: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      if (dir[e.key]) {
        e.preventDefault();
        nudge(dir[e.key][0] * step, dir[e.key][1] * step);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      e.stopPropagation();
      if (e.key === ' ') spaceRef.current = false;
    }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  });

  // ── Playback ────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => (v + dt / 2) % 1); // one pass every two seconds
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Actions ─────────────────────────────────────────
  async function runAutoMatch() {
    if (!view || !bitmaps.a || !bitmaps.b) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setMatching(0);
    setError(null);
    try {
      const incoming = await autoMatch(bitmaps.a, bitmaps.b, view, {
        onProgress: (p) => setMatching(p),
        signal: ac.signal,
      });
      setDraft((d) => ({ ...d, pairs: mergeAuto(d.pairs, incoming) }));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof ModelMissingError
          ? err.message
          : `Auto-match failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setMatching(null);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    onClose();
  }

  function done() {
    abortRef.current?.abort();
    updateLayer(sceneIndex, layer.id, { morph: draft } as Partial<Layer>);
    onClose();
  }

  const available = autoMatchAvailable();
  const canMatch = available && !!view && matching === null;
  const matchTitle = available ? 'Find matching points automatically' : 'Auto-match needs the desktop app';
  const zoomed = (pane: PaneId) => views[pane] !== DEFAULT_VIEW;
  const caption: Record<PaneId, string> = {
    a: `A · ${baseName(layer.src)}`,
    mid: `Result · t = ${t.toFixed(2)}`,
    b: `B · ${baseName(target)}`,
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-panel morph-editor" onClick={(e) => e.stopPropagation()}>
        <div className="morph-toolbar">
          <b>Morph points · {draft.pairs.length} pairs</b>
          {matching === null ? (
            <button className="morph-btn primary" disabled={!canMatch} title={matchTitle} onClick={runAutoMatch}>
              Auto-match
            </button>
          ) : (
            <span className="morph-progress">
              <span className="morph-progress-bar"><span style={{ width: `${Math.round(matching * 100)}%` }} /></span>
              <button className="morph-btn" onClick={() => abortRef.current?.abort()}>Cancel</button>
            </span>
          )}
          <button className="morph-btn" onClick={() => setDraft((d) => ({ ...d, pairs: clearAuto(d.pairs) }))}>
            Clear auto
          </button>
          <button className={`morph-btn${showMesh ? ' active' : ''}`} onClick={() => setShowMesh((m) => !m)}>
            Mesh
          </button>
          <span className="morph-spacer" />
          <button className="morph-btn" onClick={cancel}>Cancel</button>
          <button className="morph-btn primary" onClick={done}>Done</button>
        </div>
        {error && <p className="morph-error">{error}</p>}
        <div className="morph-panes">
          {PANES.map((pane) => (
            <div className={`morph-pane ${pane}`} key={pane}>
              <div className="morph-cap">
                <span>{view ? caption[pane] : 'Loading images…'}</span>
                {zoomed(pane) && (
                  <button className="morph-fit" onClick={() => setViews((v) => ({ ...v, [pane]: DEFAULT_VIEW }))}>
                    Fit
                  </button>
                )}
              </div>
              <canvas
                ref={refs[pane]}
                onPointerDown={(e) => onPointerDown(pane, e)}
                onPointerMove={(e) => onPointerMove(pane, e)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={() => setHover(null)}
                onWheel={(e) => onWheel(pane, e)}
              />
            </div>
          ))}
        </div>
        <div className="morph-scrub">
          <button className="morph-btn" onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚' : '▶'}</button>
          <input
            type="range" min={0} max={1} step={0.01} value={t}
            onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
          />
          <span>t = {t.toFixed(2)}</span>
        </div>
        <div className="morph-legend">
          <span><i style={{ background: COLORS.high }} />confident</span>
          <span><i style={{ background: COLORS.low }} />weak</span>
          <span><i style={{ background: COLORS.manual }} />manual</span>
          <span>Click to add · drag to move · arrows nudge (Shift ×10) · Delete removes · wheel zooms · Space-drag pans</span>
        </div>
      </div>
    </div>
  );
}
