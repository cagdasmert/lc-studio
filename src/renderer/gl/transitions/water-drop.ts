// WaterDrop.glsl from gl-transitions (https://github.com/gl-transitions/gl-transitions)
// at commit e1e4bde, copied unchanged with its own header (CRLF line endings normalised). Licence: MIT;
// see THIRD_PARTY_NOTICES.md.
export default String.raw`// Author: Paweł Płóciennik
// License: MIT
// Description: Ripples spread from the center like a drop falling into water, crossfading to the incoming image
// Tags: ripple, water, blend
// @param Frequency of the ripples
uniform float amplitude; // = 30
// @param Speed of the ripples
uniform float speed; // = 30

vec4 transition(vec2 p) {
  vec2 dir = p - vec2(.5);
  float dist = length(dir);

  if (dist > progress) {
    return mix(getFromColor( p), getToColor( p), progress);
  } else {
    vec2 offset = dir * sin(dist * amplitude - progress * speed);
    return mix(getFromColor( p + offset), getToColor( p), progress);
  }
}
`;
