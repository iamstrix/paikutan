import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so dist/ works from any static host or subfolder (GitHub Pages, Netlify).
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    // Two pages: the game, and the phone controller the pairing QR opens.
    rollupOptions: { input: { main: 'index.html', controller: 'controller.html' } },
    chunkSizeWarningLimit: 900,
  },
});
