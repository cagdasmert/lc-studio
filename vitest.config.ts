import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Almost all renderer logic under test is pure — no DOM needed. The one
    // exception, layer-fx-composite.test.ts, shims `document.createElement`
    // onto node-canvas itself rather than dragging jsdom in for every file.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
