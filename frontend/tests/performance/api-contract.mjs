import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createRequire} from "node:module";
import vm from "node:vm";
import ts from "typescript";
const root=resolve(import.meta.dirname,"../.."),require=createRequire(import.meta.url),cache=new Map();
function load(file){
  const path=file.endsWith(".ts")?file:`${file}.ts`;if(cache.has(path))return cache.get(path);const module={exports:{}};cache.set(path,module.exports);
  const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const get=id=>id==="zod"?require(id):id==="./live-config"?{LIVE_SYNC_ID:"sepolia-v4",LIVE_API_BASE:"https://unused.invalid"}:id==="@/lib/ui-measurement"?load(resolve(root,"src/lib/ui-measurement")):id.startsWith(".")?load(resolve(dirname(path),id)):(()=>{throw Error(`Unexpected validator dependency ${id}`);})();
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,BigInt,Intl,Error})(get,module,module.exports);return module.exports;
}
const api=load(resolve(root,"src/lib/live-api")),mapping=load(resolve(root,"src/lib/live-mapping"));
export function validatePayload(path,value){
  const list=path==="/streams",detail=/^\/streams\/\d+$/.test(path),trades=/^\/users\//.test(path);
  if(!list&&!detail&&!trades)throw Error("No validator configured for path");
  const parsed=(list?api.streamListSchema:detail?api.detailSchema:api.tradeListSchema).parse(value);
  mapping.projectionTime(parsed.meta.projection);
  for(const stream of list?parsed.data:detail?[parsed.data]:[]){
    const token="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9";
    if(!mapping.mapStream(stream,parsed.meta.projection,token))throw Error("Unsupported token in measured dataset");
    mapping.mapRecords([stream],[],stream.currentOwner||stream.sender,mapping.projectionTime(parsed.meta.projection),token);
  }
  if(detail&&parsed.data.streamId!==path.split("/").at(-1))throw Error("Wrong requested stream");
  if(trades){const account=path.split("/")[2].toLowerCase();if(parsed.data.some(t=>t.seller.toLowerCase()!==account&&t.buyer.toLowerCase()!==account))throw Error("Mixed account history");}
  return parsed;
}
