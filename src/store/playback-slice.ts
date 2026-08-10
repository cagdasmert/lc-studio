import type { StateCreator } from 'zustand';

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2;

export interface PlaybackSlice {
  currentFrame: number;
  playing: boolean;
  loop: boolean;
  speed: PlaybackSpeed;
  setCurrentFrame: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setLoop: (loop: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  stepForward: () => void;
  stepBackward: () => void;
}

export const createPlaybackSlice: StateCreator<PlaybackSlice> = (set) => ({
  currentFrame: 0,
  playing: false,
  loop: true,
  speed: 1,

  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setPlaying: (playing) => set({ playing }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setLoop: (loop) => set({ loop }),
  setSpeed: (speed) => set({ speed }),
  stepForward: () => set((s) => ({ currentFrame: s.currentFrame + 1 })),
  stepBackward: () => set((s) => ({ currentFrame: Math.max(0, s.currentFrame - 1) })),
});
