import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VESTORA_");
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
    }
  };
});
