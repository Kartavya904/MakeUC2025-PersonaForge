import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// IMPORTANT: our index.html lives in ./renderer/
export default defineConfig({
  root: 'renderer',
  base: './',                            // needed for file:// loads
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: '../renderer-dist',          // output to apps/desktop/renderer-dist
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'renderer/index.html'),
        overlay: resolve(__dirname, 'renderer/overlay.html')
      }
    }
  },
  publicDir: 'public'  // Ensure public directory is copied
});
