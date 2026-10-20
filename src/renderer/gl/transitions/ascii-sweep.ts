// lc-studio's own transition shader (not from gl-transitions). GLSL ES 3.00.
//
// A soft band sweeps left to right. Ahead of it is the outgoing scene, behind
// it the incoming one. Inside the band the frame is cells of density glyphs
// (RAMP from glyphs.ts, passed as u_ramp), each picked by the luminance of
// the scene under it — the incoming scene on the band's trailing half, the
// outgoing one on its leading half — with a brightness surge at the centre.
export default `#version 300 es
precision highp float;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
uniform float u_cell;    // px per glyph cell
uniform float u_band;    // band width, fraction of the frame width
uniform float u_surge;   // brightness added at the band centre
uniform uint u_ramp[10]; // 5x5 glyphs, bit row*5+col, row 0 at the top
in vec2 v_uv;
out vec4 o_color;

void main() {
  float half_ = u_band * 0.5;
  float centre = -half_ + u_progress * (1.0 + u_band);
  float x = v_uv.x;
  if (x < centre - half_) { o_color = texture(u_to, v_uv); return; }
  if (x > centre + half_) { o_color = texture(u_from, v_uv); return; }

  // Which cell, and where in it (cells sit on the frame's pixel grid).
  vec2 px = gl_FragCoord.xy;
  vec2 cellIndex = floor(px / u_cell);
  vec2 cellCentreUv = (cellIndex + 0.5) * u_cell / u_resolution;
  vec2 local = px - cellIndex * u_cell;

  bool trailing = cellCentreUv.x < centre;
  vec4 src = trailing ? texture(u_to, cellCentreUv) : texture(u_from, cellCentreUv);
  float lum = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
  uint glyph = u_ramp[int(clamp(floor(lum * 9.0 + 0.5), 0.0, 9.0))];
  int col = int(min(4.0, floor(local.x * 5.0 / u_cell)));
  int row = 4 - int(min(4.0, floor(local.y * 5.0 / u_cell))); // gl_FragCoord.y runs up
  bool lit = ((glyph >> uint(row * 5 + col)) & 1u) == 1u;

  float d = abs(x - centre) / max(half_, 1e-5);
  float surge = u_surge * (1.0 - smoothstep(0.0, 1.0, d));
  vec3 ink = min(vec3(1.0), src.rgb * (1.0 + surge) + surge * 0.5);
  vec3 paper = src.rgb * 0.15;
  o_color = vec4(lit ? ink : paper, 1.0);
}
`;
