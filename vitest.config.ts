import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Renderer logic under test is pure — no DOM, no canvas polyfill needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
