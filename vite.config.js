import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // IMPORTANT: GitHub Pages serves this repo at /ncaa-next-dynasty-tracker/
  // base MUST include leading + trailing slashes so Vite sets BASE_URL correctly.
  base: "/ncaa-next-dynasty-tracker/",
});
