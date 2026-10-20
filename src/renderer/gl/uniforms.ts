/**
 * DOM-free uniform handling for the GL pass: the value types, parsing the
 * `uniform <type> <name>; // = <value>` defaults that gl-transitions shaders
 * carry, and merging overrides. Unit-tested without WebGL.
 */

export type UniformValue =
  | { type: 'float'; value: number }
  | { type: 'int'; value: number }
  | { type: 'vec2' | 'vec3' | 'vec4'; value: number[] }
  | { type: 'ivec2' | 'ivec3' | 'ivec4'; value: number[] }
  | { type: 'mat3'; value: number[] }
  | { type: 'uint[]'; value: number[] }
  | { type: 'vec4[]'; value: number[] }
  | { type: 'float[]'; value: number[] };

export type Uniforms = Record<string, UniformValue>;

export const float = (value: number): UniformValue => ({ type: 'float', value });
export const int = (value: number): UniformValue => ({ type: 'int', value });
export const vec = (...value: number[]): UniformValue =>
  ({ type: (['vec2', 'vec3', 'vec4'] as const)[value.length - 2], value });

const VECTOR = /^(i?vec)([234])$/;

/** Parse the value written after `// =` for a uniform of `type`. */
export function parseDefault(type: string, raw: string): UniformValue | null {
  const text = raw.trim().replace(/;$/, '');
  const nums = (s: string) => s.split(',').map((x) => Number(x.trim()));
  if (type === 'float') {
    const v = Number(text);
    return Number.isFinite(v) ? { type: 'float', value: v } : null;
  }
  if (type === 'int') {
    const v = Number(text);
    return Number.isInteger(v) ? { type: 'int', value: v } : null;
  }
  if (type === 'bool') {
    return text === 'true' || text === 'false' ? { type: 'int', value: text === 'true' ? 1 : 0 } : null;
  }
  const m = VECTOR.exec(type);
  if (!m) return null;
  const n = Number(m[2]);
  const call = new RegExp(`^${type}\\s*\\((.*)\\)$`).exec(text);
  if (!call) return null;
  let values = nums(call[1]);
  if (values.length === 1) values = Array(n).fill(values[0]); // ivec2(4) → (4, 4)
  if (values.length !== n || values.some((v) => !Number.isFinite(v))) return null;
  if (m[1] === 'ivec' && values.some((v) => !Number.isInteger(v))) return null;
  return { type: type as 'vec2', value: values };
}

/** Every `uniform <type> <name>; // = <value>` default in a shader source. */
export function parseUniformDefaults(source: string): Uniforms {
  const out: Uniforms = {};
  const re = /^\s*uniform\s+(\w+)\s+(\w+)\s*;\s*\/\/\s*=\s*(.+)$/gm;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const value = parseDefault(m[1], m[3]);
    if (value) out[m[2]] = value;
  }
  return out;
}

/**
 * Defaults with numeric overrides applied (transitionParams). Only float
 * uniforms that exist in the defaults are overridden; anything else is ignored.
 */
export function withOverrides(defaults: Uniforms, overrides: Record<string, number> | undefined): Uniforms {
  if (!overrides) return defaults;
  const out: Uniforms = { ...defaults };
  for (const [name, value] of Object.entries(overrides)) {
    const d = defaults[name];
    if (d?.type === 'float' && Number.isFinite(value)) out[name] = { type: 'float', value };
  }
  return out;
}
