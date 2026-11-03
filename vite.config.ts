import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default; component tests opt into jsdom per file via
    // `// @vitest-environment jsdom` plus a jest-dom matchers import.
    environment: 'node',
  },
});
