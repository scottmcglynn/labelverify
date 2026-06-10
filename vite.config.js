import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' makes asset paths relative, so the build works when served
// from a GitHub Pages subpath (https://<user>.github.io/<repo>/) without
// hardcoding the repository name.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'node',
  },
});
