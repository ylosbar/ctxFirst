import path from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "./shared"),
      },
    },
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: path.resolve(__dirname, "electron/main/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "./shared"),
      },
    },
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: path.resolve(__dirname, "electron/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: __dirname,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "strip-crossorigin",
        transformIndexHtml(html) {
          return html.replace(/\s+crossorigin(="[^"]*")?/g, "");
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "./shared"),
      },
    },
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: path.resolve(__dirname, "index.html"),
      },
    },
  },
});
