import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // 👇 این خط جادویی مشکل EBUSY رو حل می‌کنه
      ignored: ["**/src-tauri/**"],
    },
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
});