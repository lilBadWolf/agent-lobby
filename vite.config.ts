import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  base: './',
  plugins: [vue()],
  define: {
    global: 'globalThis'
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('node_modules/vue')) {
            return 'vue-vendor';
          }

          if (id.includes('node_modules/@tauri-apps')) {
            return 'tauri-vendor';
          }

          if (id.includes('node_modules/mqtt')) {
            return 'mqtt-vendor';
          }

          if (id.includes('node_modules/peerjs')) {
            return 'rtc-vendor';
          }

          if (id.includes('node_modules/node-emoji')) {
            return 'emoji-vendor';
          }

          return 'vendor';
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
