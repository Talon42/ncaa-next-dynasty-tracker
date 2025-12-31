import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isElectron = mode === "electron";

  return {
    plugins: [react()],
    // IMPORTANT: GitHub Pages serves this repo at /ncaa-next-dynasty-tracker/
    // base MUST include leading + trailing slashes so Vite sets BASE_URL correctly.
    base: isElectron ? "/" : "/ncaa-next-dynasty-tracker/",
    build: {
      outDir: isElectron ? "dist-electron" : "dist",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: false,
      host: "127.0.0.1",
    },
  };
});
