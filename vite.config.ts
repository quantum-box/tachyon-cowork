import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const platform = process.env.VITE_PLATFORM ?? (isTauri ? "tauri" : "web");
const isWeb = platform === "web" && !isTauri;

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
      // On web builds, treat Tauri packages as external so dynamic imports
      // become no-ops (they are never reached because isTauri() === false).
      rollupOptions: isWeb
        ? {
            external: (id: string) => id.startsWith("@tauri-apps/"),
          }
        : {},
    },
  };
});
