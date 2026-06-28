import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Project Pages serve under /rules-builder/; keep dev at root.
  base: command === 'build' ? '/rules-builder/' : '/',
  root: 'examples',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
}));
