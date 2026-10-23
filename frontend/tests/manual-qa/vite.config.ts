import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"../..");
export default defineConfig({
  root,
  plugins:[{
    name:"manual-qa-only",enforce:"pre",
    resolveId(source,importer){if(source==="./use-injected-wallet"&&importer?.replaceAll("\\","/").endsWith("/src/hooks/use-live-snapshot.ts"))return path.resolve(root,"tests/manual-qa/wallet.ts");},
    transformIndexHtml:{order:"pre",handler(html){return html.replace('/src/main.tsx','/tests/manual-qa/main.tsx');}},
  },react()],
  resolve:{alias:{"@":path.resolve(root,"src")}},
  define:{"import.meta.env.VITE_DATA_MODE":JSON.stringify("live"),"import.meta.env.VITE_VESTORA_API_URL":JSON.stringify(process.env.VESTORA_QA_PERF==="1"?"http://127.0.0.1:4392/api":"http://127.0.0.1:4391"),"import.meta.env.VITE_SEPOLIA_RPC_URL":JSON.stringify("http://127.0.0.1:4391/rpc")},
  server:{host:"127.0.0.1",port:4212,strictPort:true},
  preview:{host:"127.0.0.1",port:4213,strictPort:true},
  build:{outDir:"qa-dist",emptyOutDir:true},
});
