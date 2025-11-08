import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// IMPORTANT: our index.html lives in ./renderer/
export default defineConfig({
  root: 'renderer',
  base: './',                            // needed for file:// loads
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: '../renderer-dist',          // output to apps/desktop/renderer-dist
    emptyOutDir: true
  }
});
