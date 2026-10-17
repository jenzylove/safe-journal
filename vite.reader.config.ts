import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist-reader",
    emptyOutDir: true,
    rollupOptions: { input: "reader.html" },
  },
});
