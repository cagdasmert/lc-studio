import type { TransitionType } from '../types';

/**
 * The one list of scene transitions, with their labels. The inspector, the
 * AI prompt and the AI parser all read it from here, so a new transition is
 * added in this file (and drawn in src/renderer/transitions.ts).
 */
export const TRANSITION_LABELS: Record<TransitionType, string> = {
  none: 'None',
  cut: 'Cut',
  fade: 'Fade',
  'slide-left': 'Slide left',
  'slide-right': 'Slide right',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down',
  'wipe-horizontal': 'Wipe horizontal',
  'wipe-vertical': 'Wipe vertical',
  'zoom-in': 'Zoom in',
  'zoom-out': 'Zoom out',
  dissolve: 'Dissolve',
};

export const TRANSITION_TYPES = Object.keys(TRANSITION_LABELS) as TransitionType[];

export function isTransitionType(value: unknown): value is TransitionType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TRANSITION_LABELS, value);
}
