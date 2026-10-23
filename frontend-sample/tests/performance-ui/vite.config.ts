import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import {readFileSync} from "node:fs";
import {resolveQaRunConfig,qaEnvironmentDefines} from "./run-config.mjs";

const root=path.resolve(import.meta.dirname,"../.."),qa=path.join(root,"tests/performance-ui");
const run=resolveQaRunConfig(process.env,filename=>readFileSync(filename,"utf8"));
export default defineConfig({root,plugins:[{
  name:"api-ui-correlation-qa",enforce:"pre",
  resolveId(source,importer){
    const parent=importer?.replaceAll("\\","/")??"";
    const normalized=source.replaceAll("\\","/");
    if(source==="@/lib/ui-measurement"||/\/src\/lib\/ui-measurement(?:\.ts)?$/.test(normalized))return path.join(qa,"runtime.ts");
    if(source==="./use-injected-wallet"&&parent.endsWith("/src/hooks/use-live-snapshot.ts"))return path.join(qa,"read-only-wallet.ts");
    if((source==="@/lib/live-chain"||/\/src\/lib\/live-chain(?:\.ts)?$/.test(normalized))&&parent.endsWith("/src/hooks/use-live-snapshot.ts"))return path.join(qa,"no-rpc.ts");
  },
  transformIndexHtml:{order:"pre",handler:html=>html.replace("/src/main.tsx","/tests/performance-ui/main.tsx")},
  generateBundle(_options,bundle){
    const modules=Object.values(bundle).flatMap(output=>output.type==="chunk"?output.moduleIds:[]).map(id=>id.replaceAll("\\","/"));
    for(const file of ["runtime.ts","read-only-wallet.ts","no-rpc.ts"])if(!modules.some(id=>id.endsWith(`/tests/performance-ui/${file}`)))throw Error(`QA adapter missing: ${file}`);
    for(const file of ["ui-measurement.ts","live-chain.ts"])if(modules.some(id=>id.endsWith(`/src/lib/${file}`)))throw Error(`QA adapter bypass: ${file}`);
    if(modules.some(id=>id.endsWith("/src/hooks/use-injected-wallet.ts")))throw Error("Real wallet hook included in QA build");
  },
},react()],resolve:{alias:[
  {find:"@/lib/ui-measurement",replacement:path.join(qa,"runtime.ts")},
  {find:"@/lib/live-chain",replacement:path.join(qa,"no-rpc.ts")},
  {find:"@",replacement:path.join(root,"src")},
]},
  define:qaEnvironmentDefines(run),
  server:{host:"127.0.0.1",port:run.mode==="actual-api"?4343:4340,strictPort:true},preview:{host:"127.0.0.1",port:run.mode==="actual-api"?4342:4341,strictPort:true},
  build:{outDir:run.outDir,emptyOutDir:true,target:"es2022"},
});
