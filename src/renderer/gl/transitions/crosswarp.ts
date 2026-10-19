// crosswarp.glsl from gl-transitions (https://github.com/gl-transitions/gl-transitions)
// at commit e1e4bde, copied unchanged with its own header (CRLF line endings normalised). Licence: MIT;
// see THIRD_PARTY_NOTICES.md.
export default String.raw`// Author: Eke Péter <peterekepeter@gmail.com>
// License: MIT
// Description: The outgoing image zooms in while the incoming one zooms out into place, sweeping from right to left
// Tags: warp, zoom, horizontal
vec4 transition(vec2 p) {
  float x = progress;
  x=smoothstep(.0,1.0,(x*2.0+p.x-1.0));
  return mix(getFromColor((p-.5)*(1.-x)+.5), getToColor((p-.5)*x+.5), x);
}
`;
