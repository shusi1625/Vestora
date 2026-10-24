import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root=resolve(import.meta.dirname,".."),Figure=Symbol("Figure");
function fixture(){
  let selected=null;
  const element=(type,props)=>({type,props});
  const imports={react:{useState:()=>[selected,value=>{selected=value;}]},"react-i18next":{useTranslation:()=>({t:key=>key})},"react/jsx-runtime":{jsx:element,jsxs:element},"@/components/workspace/WorkspaceUI":{Figure}};
  const code=ts.transpileModule(readFileSync(resolve(root,"src/pages/assets/AssetComposition.tsx"),"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{BigInt,Number})(id=>{assert.ok(id in imports,`Unexpected import ${id}`);return imports[id];},module,module.exports);
  return{render:()=>module.exports.AssetComposition({portfolio:{wallet:1n,claimable:2n,future:3n,total:6n,claimableCount:1},token:"MockUSDC"})};
}
function nodes(node,type){
  if(!node||typeof node!=="object")return[];
  if(Array.isArray(node))return node.flatMap(n=>nodes(n,type));
  return [...(node.type===type?[node]:[]),...nodes(node.props?.children,type)];
}
test("asset legend keeps precision-capable Figures outside category buttons",()=>{
  const tree=fixture().render(),buttons=nodes(tree,"button");
  assert.equal(buttons.length,3);assert.equal(nodes(tree,Figure).length,3);
  for(const button of buttons){assert.equal(nodes(button.props.children,Figure).length,0);assert.equal(nodes(button.props.children,"button").length,0);assert.equal(button.props.type,"button");}
});
test("asset category selection toggles independently of precision disclosure",()=>{
  const f=fixture();nodes(f.render(),"button")[1].props.onClick();
  assert.equal(nodes(f.render(),"button")[1].props["aria-pressed"],true);
  nodes(f.render(),"button")[1].props.onClick();
  assert.equal(nodes(f.render(),"button").some(b=>b.props["aria-pressed"]),false);
});
