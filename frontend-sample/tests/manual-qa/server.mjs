import http from "node:http";
import {parseAbi,encodeFunctionData,decodeFunctionData,encodeAbiParameters,encodeEventTopics,toHex} from "viem";
import {scaledCount,scaledStream,fixtureApiCap} from "./scaled-data.mjs";

const A="0x1111111111111111111111111111111111111111",B="0x2222222222222222222222222222222222222222",C="0x3333333333333333333333333333333333333333";
const STREAM="0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",USDC="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9";
const HASH=`0x${"a".repeat(64)}`,HASH2=`0x${"b".repeat(64)}`,RECOVERY_HASH=`0x${"d".repeat(64)}`,BLOCK=`0x${"c".repeat(64)}`,ZERO=`0x${"0".repeat(64)}`;
const abi=parseAbi(["function ownerOf(uint256 tokenId) view returns (address)","function getStream(uint256 streamId) view returns ((address sender,address token,uint256 depositedAmount,uint64 startTime,uint64 endTime,uint256 withdrawnAmount,bool cancelable,bool canceled,uint64 canceledAt))","function claimableAmount(uint256 streamId) view returns (uint256)","function claim(uint256 streamId) returns (uint256)","function decimals() view returns (uint8)","function balanceOf(address account) view returns (uint256)","function allowance(address owner,address spender) view returns (uint256)","function approve(address spender,uint256 amount) returns (bool)","function createStream(address recipient,address token,uint256 amount,uint256 startTime,uint256 endTime,bool cancelable) returns (uint256)","event StreamClaimed(uint256 indexed streamId,address indexed recipient,uint256 amount)","event Approval(address indexed owner,address indexed spender,uint256 value)","event StreamCreated(uint256 indexed streamId,address indexed sender,address indexed recipient,address token,uint256 depositedAmount,uint256 startTime,uint256 endTime,bool cancelable)"]);
const selectors=Object.fromEntries([['ownerOf',[3n]],['getStream',[3n]],['claimableAmount',[3n]],['claim',[3n]],['decimals',[]],['balanceOf',[B]],['allowance',[B,STREAM]],['approve',[STREAM,1000000n]],['createStream',[B,USDC,1000000n,1n,2n,true]]].map(([name,args])=>[name,encodeFunctionData({abi,functionName:name,args}).slice(0,10)]));
let state;
function reset(mode="normal"){state={mode,at:BigInt(Math.floor(Date.now()/1000)),apiRequests:0,rpcRequests:0,rpcFailures:0,receiptReads:0,sendCount:0,projected:true,failed:false,lastMethods:[],tx:null,transactions:{},recoveryCandidate:mode.startsWith("E25-")&&mode!=="E25-recovery"?RECOVERY_HASH:null,allowance:mode==="B23-minus"?999999n:mode==="B23-plus"?1000001n:1000000n,changed:false,claimable:mode==="B22-zero"?0n:mode==="B22-one"?1n:["B25-one","B25-two"].includes(mode)?950000n:1000000n};}
reset();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const uint=value=>encodeAbiParameters([{type:"uint256"}],[BigInt(value)]);
const historyCount=()=>state.mode==="B25-one"?1:state.mode==="B25-two"?2:0;
function projection(){const at=new Date(Number(state.at)*1000).toISOString(),block=state.tx&&state.projected?102:100,unavailable=["E07-null","E07-not-started"].includes(state.mode);return {chainId:state.mode==="E04-chain"?1:11155111,syncId:state.mode==="E04-sync"?"other-deployment":"sepolia-v4",status:"synced",projectionStatus:state.mode==="E07-not-started"?"not_started":state.mode==="E07-pending"?"pending":"applied",latestProjectedBlock:unavailable?null:String(block),latestIndexedBlock:state.mode==="E07-pending"?"101":String(block),latestProjectedBlockTimestamp:unavailable?null:at,estimateAt:unavailable?null:state.mode==="E07-time-mismatch"?new Date(Number(state.at+1n)*1000).toISOString():at};}
function stream(id="3"){
  if(scaledCount(state.mode))return scaledStream(state.mode,state.at,id);
  if(id==="5"&&state.tx?.kind==="create"){
    const [recipient,token,amount,start,end,cancelable]=state.tx.args,deposit=BigInt(amount),s=BigInt(start),e=BigInt(end),elapsed=state.at<=s?0n:state.at>=e?e-s:state.at-s,vested=deposit*elapsed/(e-s);
    const at=new Date(Number(state.at)*1000).toISOString();return {streamId:id,sender:state.tx.from,recipient,currentOwner:recipient,token,depositedAmount:amount,withdrawnAmount:"0",startTime:new Date(Number(s)*1000).toISOString(),endTime:new Date(Number(e)*1000).toISOString(),cancelable,canceledAt:null,createdTxHash:state.tx.hash,computed:{vestedAmount:String(vested),claimableEstimate:String(vested),remainingReceivable:amount,estimateTimestamp:at},listing:null,claims:[]};
  }
  const paid=Boolean(state.tx&&state.projected&&state.tx.kind==="claim"&&!["E19-replaced","E20-revert"].includes(state.mode)&&!state.mode.startsWith("E22-")),amount=state.claimable;
  const historical=historyCount()>0,active=id==="4"&&state.mode!=="B26-tied"&&!historical,owner=active?A:B,deposit=active?2000000n:state.mode==="B22-one"?1n:1000000n,withdrawn=(historical?50000n:0n)+(paid&&id==="3"?amount:0n),vested=active?1000000n:deposit;
  const timestamp=new Date(Number(state.at)*1000).toISOString();
  const claims=historical?[{id:`history-${id}`,streamId:id,recipient:B,amount:"50000",claimedAt:new Date(Number(state.at-10n)*1000).toISOString(),transactionHash:id==="3"?HASH2:RECOVERY_HASH,logIndex:0}]:[];
  if(paid&&id==="3")claims.push({id:"claim-fixture",streamId:id,recipient:B,amount:String(amount),claimedAt:timestamp,transactionHash:["E24-proof","E18-reprice"].includes(state.mode)?HASH2:HASH,logIndex:0});
  return {streamId:id,sender:A,recipient:owner,currentOwner:state.mode==="E04-address"?"invalid":owner,token:state.mode==="E04-token"?C:USDC,depositedAmount:String(deposit),withdrawnAmount:String(withdrawn),startTime:new Date(Number(state.at-1000n)*1000).toISOString(),endTime:new Date(Number(state.at+(active?1000n:-1n))*1000).toISOString(),cancelable:!active,canceledAt:null,createdTxHash:HASH2,
    computed:{vestedAmount:String(vested),claimableEstimate:state.mode==="E04-accounting"?"999999999":String(vested-withdrawn),remainingReceivable:String(deposit-withdrawn),estimateTimestamp:state.mode==="E07-computed-time"?new Date(Number(state.at+1n)*1000).toISOString():timestamp},
    listing:{streamId:id,seller:owner,price:active?"2000000":"850000",status:"ACTIVE",listedAt:new Date(Number(state.at-100n)*1000).toISOString(),soldAt:null,canceledAt:null,invalidatedAt:null,listingTxHash:HASH2,boughtTxHash:null,buyer:null},
    claims};
}
function transaction(hash=HASH){
  const tx=state.transactions[hash]||state.tx||{from:B,to:STREAM,data:encodeFunctionData({abi,functionName:"claim",args:[3n]}),kind:"claim"};
  const replacement=["E18-reprice","E19-replaced"].includes(state.mode),pending=state.mode==="E17-receipt"||replacement&&hash===HASH;
  const wrapper=state.mode==="E21-wrapper"||state.mode.startsWith("E22-");
  return {hash,from:tx.from,to:state.mode==="E19-replaced"&&hash===HASH2?tx.from:wrapper?C:tx.to,input:state.mode==="E19-replaced"&&hash===HASH2?"0x":wrapper?"0xdeadbeef":tx.data,value:"0x0",nonce:"0x1",chainId:"0xaa36a7",gas:"0xc350",gasPrice:hash===HASH2?"0xee6b2800":"0x77359400",type:"0x0",r:ZERO,s:ZERO,v:"0x1b",blockHash:pending?null:BLOCK,blockNumber:pending?null:"0x65",transactionIndex:pending?null:"0x0"};
}
function block(number=102,full=false){const replacement=["E18-reprice","E19-replaced"].includes(state.mode),hash=replacement?HASH2:state.tx?.hash||HASH;return {number:toHex(number),hash:BLOCK,parentHash:ZERO,timestamp:toHex(state.at),baseFeePerGas:toHex(1000000000n),gasLimit:"0x1c9c380",gasUsed:"0xc350",miner:A,difficulty:"0x0",totalDifficulty:"0x0",size:"0x100",extraData:"0x",nonce:"0x0000000000000000",sha3Uncles:ZERO,logsBloom:`0x${"0".repeat(512)}`,receiptsRoot:ZERO,stateRoot:ZERO,transactionsRoot:ZERO,mixHash:ZERO,transactions:state.tx&&state.mode!=="E17-receipt"?[full?transaction(hash):hash]:[],uncles:[]};}
function receipt(hash){
  const tx=state.transactions[hash]||state.tx;if(!tx)return null;
  const create=tx.kind==="create",event=create?"StreamCreated":tx.kind==="approval"?"Approval":"StreamClaimed",eventArgs=create?{streamId:5n,sender:tx.from,recipient:tx.args[0]}:tx.kind==="approval"?{owner:tx.from,spender:STREAM}:{streamId:state.mode==="E22-event"?999n:3n,recipient:state.mode==="E22-recipient"?C:tx.from};
  const data=create?encodeAbiParameters([{type:"address"},{type:"uint256"},{type:"uint256"},{type:"uint256"},{type:"bool"}],[tx.args[1],BigInt(tx.args[2]),BigInt(tx.args[3]),BigInt(tx.args[4]),tx.args[5]]):uint(tx.kind==="approval"?BigInt(`0x${tx.data.slice(-64)}`):state.mode==="E22-amount"?0n:state.claimable);
  const log={address:tx.kind==="approval"?USDC:state.mode==="E22-contract"?C:STREAM,topics:encodeEventTopics({abi,eventName:event,args:eventArgs}),data,blockNumber:"0x65",blockHash:BLOCK,transactionHash:hash,transactionIndex:"0x0",logIndex:"0x0",removed:false};
  const logs=["E19-replaced","E22-missing"].includes(state.mode)?[]:state.mode==="E22-duplicate"?[log,{...log,logIndex:"0x1"}]:[log];
  return {transactionHash:hash,transactionIndex:"0x0",blockHash:BLOCK,blockNumber:"0x65",from:tx.from,to:tx.to,cumulativeGasUsed:"0xc350",gasUsed:"0xc350",effectiveGasPrice:"0x77359400",contractAddress:null,logs,logsBloom:`0x${"0".repeat(512)}`,status:state.mode==="E20-revert"?"0x0":"0x1",type:"0x0"};
}
async function rpc(method,params=[]){
  state.rpcRequests++;state.lastMethods.push(method);state.lastMethods=state.lastMethods.slice(-12);
  if(state.rpcRequests>1500)throw Error("fixture request cap");
  if(state.mode==="E05-balance"&&["eth_getBalance","eth_call"].includes(method))throw Error("fixture balance RPC unavailable");
  if(state.mode==="E23-rpc"&&state.tx&&state.projected){state.rpcFailures++;throw Error("fixture post-receipt RPC unavailable");}
  if(method==="eth_chainId")return state.mode==="E08-chain"?"0x1":"0xaa36a7";
  if(method==="eth_blockNumber")return "0x66";
  if(method==="eth_getBlockByNumber")return block(params[0]==="latest"?102:Number(BigInt(params[0])),Boolean(params[1]));
  if(method==="eth_getTransactionCount")return "0x1";
  if(method==="eth_getBalance"){
    if(state.mode==="E26-late"&&params[0].toLowerCase()===A)await sleep(1800);
    const fee=100000000000000n;
    return toHex(state.mode==="B24-zero"?0n:state.mode==="B24-minus"?fee-1n:["B24-equal","B24-maxfee"].includes(state.mode)?fee:state.mode==="B24-plus"?fee+1n:1000000000000000n);
  }
  if(method==="eth_gasPrice")return "0x77359400";
  if(method==="eth_maxPriorityFeePerGas")return toHex(state.mode==="B24-maxfee"?3000000000n:800000000n);
  if(method==="eth_estimateGas")return "0xc350";
  if(method==="eth_getTransactionByHash"){
    if(state.recoveryCandidate&&params[0]===RECOVERY_HASH){const tx=transaction(HASH),pending=state.mode==="E25-pending";return {...tx,hash:RECOVERY_HASH,from:state.mode==="E25-sender"?A:B,input:state.mode==="E25-id"?encodeFunctionData({abi,functionName:"claim",args:[4n]}):tx.input,nonce:"0x2",blockHash:pending?null:BLOCK,blockNumber:pending?null:"0x65",transactionIndex:pending?null:"0x0"};}
    return state.transactions[params[0]]||["E18-reprice","E19-replaced"].includes(state.mode)&&params[0]===HASH2?transaction(params[0]):null;
  }
  if(method==="eth_getTransactionReceipt"){
    state.receiptReads++;
    if(state.recoveryCandidate&&params[0]===RECOVERY_HASH)return state.mode==="E25-pending"?null:{...receipt(HASH),transactionHash:RECOVERY_HASH,status:"0x0",logs:[]};
    if(state.mode==="E17-receipt"||["E18-reprice","E19-replaced"].includes(state.mode)&&params[0]===HASH)return null;
    return state.transactions[params[0]]||["E18-reprice","E19-replaced"].includes(state.mode)&&params[0]===HASH2?receipt(params[0]):null;
  }
  if(method!=="eth_call")throw Error(`Unsupported fixture RPC ${method}`);
  const data=params[0].data||"0x",selector=data.slice(0,10);
  if(selector===selectors.decimals)return uint(6);
  if(selector===selectors.balanceOf){if(state.mode==="B25-zero-assets")return uint(0);if(state.mode==="E16-balance"&&state.changed)return uint(999999);const address=`0x${data.slice(-40)}`.toLowerCase();const paid=state.tx?.kind==="claim"&&state.projected&&!["E19-replaced","E20-revert"].includes(state.mode)&&!state.mode.startsWith("E22-");const initial=address===A?10000000n:2000000n+BigInt(historyCount())*50000n+(paid?state.claimable:0n);const debit=state.tx?.kind==="create"&&state.projected&&state.tx.from.toLowerCase()===address?BigInt(state.tx.args[2]):0n;return uint(initial-debit);}
  if(selector===selectors.allowance)return uint(state.mode==="E16-allowance"&&state.changed?0n:state.allowance);
  if(selector===selectors.ownerOf)return encodeAbiParameters([{type:"address"}],[state.mode==="E16-owner"&&state.changed?A:B]);
  if(selector===selectors.claimableAmount)return uint(state.tx&&state.tx.kind==="claim"?0:state.claimable);
  if(selector===selectors.getStream)return encodeAbiParameters([{type:"tuple",components:[{type:"address"},{type:"address"},{type:"uint256"},{type:"uint64"},{type:"uint64"},{type:"uint256"},{type:"bool"},{type:"bool"},{type:"uint64"}]}],[[A,USDC,state.mode==="B22-one"?1n:1000000n,state.at-1000n,state.at-1n,state.mode==="B22-one"&&state.tx?.kind==="claim"?1n:state.mode==="E16-withdrawn"&&state.changed?1n:0n,true,false,0n]]);
  if(selector===selectors.claim){if(state.mode==="E08-simulate")throw Error("execution reverted: fixture simulation");return uint(state.claimable);}
  if(selector===selectors.approve)return uint(1);
  if(selector===selectors.createStream)return uint(5);
  throw Error(`Unknown fixture selector ${selector}`);
}
const send=(res,value,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(value));};
async function body(req){let value="";for await(const chunk of req){value+=chunk;if(value.length>32768)throw Error("Body too large");}return value?JSON.parse(value):{};}
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;if(origin&&!["http://127.0.0.1:4212","http://127.0.0.1:4213"].includes(origin)){send(res,{error:"Origin forbidden"},403);return;}
  if(origin)res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");res.setHeader("Cache-Control","no-store");
  if(req.method==="OPTIONS"){res.writeHead(204);res.end();return;}
  try{
    if(req.url==="/qa/status"){send(res,{...state,at:String(state.at),allowance:String(state.allowance),claimable:String(state.claimable)});return;}
    if(req.url==="/qa/case"&&req.method==="POST"){const {mode}=await body(req);if(typeof mode!=="string"||mode.length>40)throw Error("Invalid mode");reset(mode);send(res,{ok:true});return;}
    if(req.url==="/qa/failure"&&req.method==="POST"){state.failed=true;send(res,{ok:true});return;}
    if(req.url==="/qa/applied"&&req.method==="POST"){state.projected=true;send(res,{ok:true});return;}
    if(req.url==="/qa/change"&&req.method==="POST"){state.changed=true;send(res,{ok:true});return;}
    if(req.url==="/qa/recover"&&req.method==="POST"){state.mode="normal";state.failed=false;state.projected=true;send(res,{ok:true});return;}
    if(req.url==="/qa/send"&&req.method==="POST"){
      if(scaledCount(state.mode)||state.mode==="P02-harness")throw Error("Performance fixtures are read-only");
      const input=await body(req);if(!input||typeof input.data!=="string"||!/^0x[\da-f]+$/i.test(input.data))throw Error("Invalid fixture transaction");
      if(![selectors.createStream,selectors.approve,selectors.claim].some(selector=>input.data.startsWith(selector)))throw Error("Unsupported fixture transaction");
      const decoded=decodeFunctionData({abi,data:input.data}),kind=decoded.functionName==="createStream"?"create":decoded.functionName==="approve"?"approval":"claim";
      state.sendCount++;const hash=state.sendCount===1?HASH:state.sendCount===2?HASH2:toHex(BigInt(state.sendCount),{size:32});
      state.tx={...input,kind,hash,args:decoded.args.map(arg=>typeof arg==="bigint"?String(arg):arg)};state.transactions[hash]=state.tx;
      if(kind==="approval")state.allowance=BigInt(state.tx.args[1]);
      state.projected=!["E23-api","E23-rpc","E24-proof"].includes(state.mode)&&!state.mode.startsWith("E25-");
      if(state.mode==="E15-double")await sleep(1000);
      send(res,{hash});return;
    }
    if(req.url==="/rpc"&&req.method==="POST"){
      const request=await body(req);const one=async r=>{try{return {jsonrpc:"2.0",id:r.id,result:await rpc(r.method,r.params)};}catch(error){return {jsonrpc:"2.0",id:r.id,error:{code:-32000,message:error.message}};}};
      send(res,Array.isArray(request)?await Promise.all(request.map(one)):await one(request));return;
    }
    if(req.method!=="GET"){send(res,{error:"No production writes exist in this fixture"},405);return;}
    state.apiRequests++;if(state.apiRequests>fixtureApiCap(state.mode))throw Error("API fixture cap");
    if(scaledCount(state.mode)){
      const now=Date.now();state.nextApiAt=Math.max(state.nextApiAt||now,now)+25;
      await sleep(state.nextApiAt-now); // At most 40 scheduled API responses/s, shared by fixture tabs.
    }
    if(state.mode==="E01-timeout")await sleep(21000);
    if(state.failed||["E03-429","E03-500","E03-502"].includes(state.mode)){send(res,{error:"injected HTTP failure"},state.failed?500:Number(state.mode.slice(-3)));return;}
    if(state.mode==="E03-json"){res.writeHead(200,{"Content-Type":"application/json"});res.end("not JSON");return;}
    if(state.mode==="E03-schema"){send(res,{data:[],meta:{}});return;}
    if(req.url?.includes("/trades")){if(state.mode==="E06-trades"){send(res,{error:"trades unavailable"},500);return;}if(state.mode==="E26-late"&&req.url.toLowerCase().includes(A))await sleep(1800);send(res,{data:[],meta:{projection:projection()}});return;}
    if(req.url==="/streams"){const count=scaledCount(state.mode)||(["B25-empty","B25-zero-assets"].includes(state.mode)?0:state.mode==="B25-one"?1:2);const rows=scaledCount(state.mode)?Array.from({length:count},(_,i)=>stream(String(i+3))):[stream("3"),stream("4")].slice(0,count);if(state.tx?.kind==="create"&&state.projected)rows.push(stream("5"));send(res,{data:rows,meta:{projection:projection()}});return;}
    const match=req.url?.match(/^\/streams\/(\d+)$/);if(match){if(state.mode==="E06-detail"&&match[1]==="4"){send(res,{error:"history unavailable"},500);return;}const row=stream(match[1]);if(!row){send(res,{error:"Fixture stream not found"},404);return;}send(res,{data:row,meta:{projection:projection()}});return;}
    send(res,{error:"Fixture route not found"},404);
  }catch(error){if(!res.headersSent)send(res,{error:error.message},500);else res.end();}
});
server.listen(4391,"127.0.0.1",()=>console.log("QA API/RPC ONLY http://127.0.0.1:4391 - no upstream network clients"));
