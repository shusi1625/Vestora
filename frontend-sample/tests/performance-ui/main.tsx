import {createRoot} from "react-dom/client";
import {installReadOnlyNetwork,installUiObservers,prepareUiReadSession,uiPerformanceSnapshot} from "./runtime";
import "../../src/i18n/config";
import "../../src/index.css";

installReadOnlyNetwork();
installUiObservers();
export function MeasurementControls(){
  return <aside aria-label="QA performance" style={{padding:8,borderBottom:"1px solid #bcc6c1",background:"#f1f5f3",fontSize:12}}>
    <strong>{import.meta.env.VITE_QA_SOURCE} · GET ONLY · RPC/WALLET BLOCKED</strong>{" "}
    <button onClick={()=>{
      const output=document.getElementById("qa-ui-evidence")!;
      if(!output.hidden){output.hidden=true;output.style.display="none";return;}
      output.textContent=JSON.stringify(uiPerformanceSnapshot());output.hidden=false;output.style.display="block";
    }}>관측 원문</button>
    <output id="qa-input-progress" aria-live="off" style={{display:"block",minHeight:18,fontSize:11}}>입력 관측 대기</output>
    <output id="qa-ui-evidence" hidden style={{display:"block",maxHeight:180,overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}/>
  </aside>;
}
const root=createRoot(document.getElementById("root")!);
let ready=false;
try{await prepareUiReadSession();ready=true;}catch{/* Show only a fixed message, never raw session details. */}
if(ready){
  const {default:App}=await import("../../src/App");
  root.render(<><MeasurementControls/><App/></>);
}else root.render(<><MeasurementControls/><p role="alert">측정 세션을 확인하지 못했습니다</p></>);
