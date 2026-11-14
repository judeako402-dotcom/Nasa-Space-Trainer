import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser') || id.includes('node_modules\\phaser')) {
            return 'phaser';
          }
          return undefined;
        },
      },
    },
  },
});
