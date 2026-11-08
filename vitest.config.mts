import { defineConfig } from 'vitest/config';
import path from 'node:path';
import url from 'node:url';

const root = path.dirname(url.fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 40_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
    },
  },
});
