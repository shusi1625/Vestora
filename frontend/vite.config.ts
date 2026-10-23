import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (process.env.VERCEL && (env.VITE_DATA_MODE === "sample" || env.VITE_VESTORA_API_URL && env.VITE_VESTORA_API_URL !== "/vestora-api")) {
    throw new Error("Vercel production must use live data through the same-origin read proxy");
  }
  const proxy = { "/vestora-api": { target:env.VESTORA_API_PROXY_TARGET || "http://15.135.223.4:3001", changeOrigin:true, rewrite:(url:string) => url.replace(/^\/vestora-api/, "") } };
  return {
    server: {
      host: "127.0.0.1",
      port: 4180,
      proxy,
    },
    plugins: [react()],
    preview: { proxy },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: '/',
    build: {
      outDir: 'dist',
      target: 'es2022',
    }
  };
});
