import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  let apiProxyTarget: string | undefined;
  try {
    apiProxyTarget = new URL(env.VITE_API_BASE_URL).origin;
  } catch {
    apiProxyTarget = undefined;
  }

  return {
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: isTauri,
      allowedHosts: true,
      ...(apiProxyTarget
        ? {
            proxy: {
              "/api": {
                target: apiProxyTarget,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
              },
            },
          }
        : {}),
    },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    build: {
      target: isTauri ? "esnext" : "modules",
      minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
  };
});
