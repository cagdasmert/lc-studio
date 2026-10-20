import type { EasingType } from '../types';

/** Easing choices grouped for <select> menus: the keyframe editor's and the motion path's. */
export const EASING_GROUPS: { group: string; values: EasingType[] }[] = [
  { group: 'Basic', values: ['linear', 'ease-in', 'ease-out', 'ease-in-out'] },
  { group: 'Sine', values: ['ease-in-sine', 'ease-out-sine', 'ease-in-out-sine'] },
  { group: 'Cubic', values: ['ease-in-cubic', 'ease-out-cubic', 'ease-in-out-cubic'] },
  { group: 'Expo', values: ['ease-in-expo', 'ease-out-expo', 'ease-in-out-expo'] },
  { group: 'Circ', values: ['ease-in-circ', 'ease-out-circ', 'ease-in-out-circ'] },
  { group: 'Back', values: ['ease-in-back', 'ease-out-back', 'ease-in-out-back'] },
  { group: 'Elastic', values: ['ease-in-elastic', 'ease-out-elastic', 'ease-in-out-elastic'] },
  { group: 'Bounce', values: ['ease-in-bounce', 'ease-out-bounce', 'ease-in-out-bounce'] },
  { group: 'Special', values: ['steps', 'cubic-bezier', 'spring'] },
];
