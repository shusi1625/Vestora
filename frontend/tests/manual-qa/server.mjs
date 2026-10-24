import http from "node:http";
import {pathToFileURL} from "node:url";
import {parseAbi,encodeFunctionData,decodeFunctionData,encodeFunctionResult,encodeAbiParameters,encodeEventTopics,toHex} from "viem";
import {scaledCount,scaledStream,fixtureApiCap} from "./scaled-data.mjs";

const A="0x1111111111111111111111111111111111111111",B="0x2222222222222222222222222222222222222222",C="0x3333333333333333333333333333333333333333";
const STREAM="0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",USDC="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9";
const MARKET="0x6184F4C3718447aBbe8B5Eb2bb73163C9Cfc49d7",ZERO_ADDRESS="0x0000000000000000000000000000000000000000";
const HASH=`0x${"a".repeat(64)}`,HASH2=`0x${"b".repeat(64)}`,RECOVERY_HASH=`0x${"d".repeat(64)}`,BLOCK=`0x${"c".repeat(64)}`,ZERO=`0x${"0".repeat(64)}`;
const abi=parseAbi(["function ownerOf(uint256 tokenId) view returns (address)","function getStream(uint256 streamId) view returns ((address sender,address token,uint256 depositedAmount,uint64 startTime,uint64 endTime,uint256 withdrawnAmount,bool cancelable,bool canceled,uint64 canceledAt))","function claimableAmount(uint256 streamId) view returns (uint256)","function claim(uint256 streamId) returns (uint256)","function decimals() view returns (uint8)","function balanceOf(address account) view returns (uint256)","function allowance(address owner,address spender) view returns (uint256)","function approve(address spender,uint256 amount) returns (bool)","function createStream(address recipient,address token,uint256 amount,uint256 startTime,uint256 endTime,bool cancelable) returns (uint256)","event StreamClaimed(uint256 indexed streamId,address indexed recipient,uint256 amount)","event Approval(address indexed owner,address indexed spender,uint256 value)","event StreamCreated(uint256 indexed streamId,address indexed sender,address indexed recipient,address token,uint256 depositedAmount,uint256 startTime,uint256 endTime,bool cancelable)"]);
const selectors=Object.fromEntries([['ownerOf',[3n]],['getStream',[3n]],['claimableAmount',[3n]],['claim',[3n]],['decimals',[]],['balanceOf',[B]],['allowance',[B,STREAM]],['approve',[STREAM,1000000n]],['createStream',[B,USDC,1000000n,1n,2n,true]]].map(([name,args])=>[name,encodeFunctionData({abi,functionName:name,args}).slice(0,10)]));
let state;
function reset(mode="normal"){state={mode,at:BigInt(Math.floor(Date.now()/1000)),apiRequests:0,rpcRequests:0,rpcFailures:0,receiptReads:0,sendCount:0,projected:true,failed:false,lastMethods:[],tx:null,transactions:{},recoveryCandidate:mode.startsWith("E25-")&&mode!=="E25-recovery"?RECOVERY_HASH:null,allowance:mode==="B23-minus"?999999n:mode==="B23-plus"?1000001n:1000000n,changed:false,claimable:mode==="B31-cancelled"?350000n:mode==="B22-zero"?0n:mode==="B22-one"?1n:["B25-one","B25-two"].includes(mode)?950000n:1000000n};if(isParityMode(mode))initParity();}
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
  const canceled=state.mode==="B31-cancelled"&&id==="3";
  const historical=historyCount()>0,active=id==="4"&&state.mode!=="B26-tied"&&!historical,owner=active?A:B,deposit=active?2000000n:state.mode==="B22-one"?1n:1000000n,withdrawn=(canceled?100000n:historical?50000n:0n)+(paid&&id==="3"?amount:0n),vested=canceled?450000n:active?1000000n:deposit;
  const timestamp=new Date(Number(state.at)*1000).toISOString();
  const claims=historical?[{id:`history-${id}`,streamId:id,recipient:B,amount:"50000",claimedAt:new Date(Number(state.at-10n)*1000).toISOString(),transactionHash:id==="3"?HASH2:RECOVERY_HASH,logIndex:0}]:[];
  if(canceled)claims.push({id:"cancelled-history-3",streamId:id,recipient:B,amount:"100000",claimedAt:new Date(Number(state.at-200n)*1000).toISOString(),transactionHash:RECOVERY_HASH,logIndex:0});
  if(paid&&id==="3")claims.push({id:"claim-fixture",streamId:id,recipient:B,amount:String(amount),claimedAt:timestamp,transactionHash:["E24-proof","E18-reprice"].includes(state.mode)?HASH2:HASH,logIndex:0});
  return {streamId:id,sender:A,recipient:owner,currentOwner:state.mode==="E04-address"?"invalid":owner,token:state.mode==="E04-token"?C:USDC,depositedAmount:String(deposit),withdrawnAmount:String(withdrawn),startTime:new Date(Number(state.at-1000n)*1000).toISOString(),endTime:new Date(Number(state.at+(active||canceled?1000n:-1n))*1000).toISOString(),cancelable:!active,canceledAt:canceled?new Date(Number(state.at-100n)*1000).toISOString():null,createdTxHash:HASH2,
    computed:{vestedAmount:String(vested),claimableEstimate:state.mode==="E04-accounting"?"999999999":String(vested-withdrawn),remainingReceivable:String((canceled?vested:deposit)-withdrawn),estimateTimestamp:state.mode==="E07-computed-time"?new Date(Number(state.at+1n)*1000).toISOString():timestamp},
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
const parityTokenAbi=parseAbi([
  "function decimals() view returns (uint8)","function balanceOf(address account) view returns (uint256)","function allowance(address owner,address spender) view returns (uint256)","function approve(address spender,uint256 amount) returns (bool)","function mint(address to,uint256 amount)",
  "event Transfer(address indexed from,address indexed to,uint256 value)","event Approval(address indexed owner,address indexed spender,uint256 value)",
]);
const parityNftAbi=parseAbi([
  "function ownerOf(uint256 id) view returns (address)","function getApproved(uint256 id) view returns (address)","function isApprovedForAll(address owner,address operator) view returns (bool)","function approve(address to,uint256 id)",
  "function getStream(uint256 id) view returns ((address sender,address token,uint256 depositedAmount,uint64 startTime,uint64 endTime,uint256 withdrawnAmount,bool cancelable,bool canceled,uint64 canceledAt))",
  "function vestedAmount(uint256 id) view returns (uint256)","function claimableAmount(uint256 id) view returns (uint256)","function claim(uint256 id) returns (uint256)","function cancel(uint256 id) returns (uint256)",
  "function createStream(address recipient,address token,uint256 amount,uint256 startTime,uint256 endTime,bool cancelable) returns (uint256)",
  "event Approval(address indexed owner,address indexed approved,uint256 indexed tokenId)","event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
  "event StreamClaimed(uint256 indexed streamId,address indexed recipient,uint256 amount)","event StreamCanceled(uint256 indexed streamId,address indexed sender,address indexed recipient,uint256 vestedAmount,uint256 senderRefund)",
  "event StreamCreated(uint256 indexed streamId,address indexed sender,address indexed recipient,address token,uint256 depositedAmount,uint256 startTime,uint256 endTime,bool cancelable)",
]);
const parityMarketAbi=parseAbi([
  "function paymentToken() view returns (address)","function receivableNft() view returns (address)","function getListing(uint256 id) view returns ((address seller,uint256 price))",
  "function list(uint256 id,uint256 price)","function cancelListing(uint256 id)","function buyWithProtection(uint256 id,uint256 maxPrice,uint256 minRemainingReceivable,uint256 maxWithdrawnAmount,address expectedSeller)",
  "event Listed(uint256 indexed streamId,address indexed seller,uint256 price)","event ListingCanceled(uint256 indexed streamId,address indexed seller)","event Purchased(uint256 indexed streamId,address indexed seller,address indexed buyer,uint256 price)",
]);
function isParityMode(mode=state?.mode){return ["parity-market","parity-cancel","parity-mint"].includes(mode);}
const lower=value=>String(value).toLowerCase(),same=(a,b)=>lower(a)===lower(b),iso=value=>new Date(Number(value)*1000).toISOString();
const parityHash=number=>toHex(0xf000n+BigInt(number),{size:32});
function parityListing(id,seller,price,at){return {streamId:id,seller,price,status:"ACTIVE",listedAt:at,soldAt:null,canceledAt:null,invalidatedAt:null,listingTxHash:HASH2,boughtTxHash:null,buyer:null};}
function initParity(){
  const at=state.at,streams={};
  for(const [id,amount,withdrawn,start,end]of [["3",1000000n,0n,at-500n,at+1500n],["4",2000000n,100000n,at-1000n,at+1000n]]){
    streams[id]={id,sender:A,recipient:B,owner:B,token:USDC,deposit:amount,withdrawn,start,end,cancelable:true,canceledAt:null,createdHash:HASH2,
      listing:id==="3"?parityListing(id,B,800000n,at-100n):null,
      claims:id==="4"?[{id:"parity-prior-4",streamId:id,recipient:B,amount:100000n,claimedAt:iso(at-100n),transactionHash:RECOVERY_HASH,logIndex:0}]:[]};
  }
  const ledger={at,streams,balances:{[lower(A)]:10000000n,[lower(B)]:2100000n,[lower(C)]:3000000n,[lower(STREAM)]:2900000n},allowances:{},approved:{"3":MARKET,"4":ZERO_ADDRESS},trades:[],totalSupply:18000000n,nextId:5n};
  state.parity={head:100,projectedBlock:100,snapshots:{100:structuredClone(ledger)},headers:{100:{at,hash:parityHash(100),transactions:[]}},transactions:{},receipts:{},nonces:{},queue:[],miningPaused:false,autoProject:false};
}
function paritySnapshot(tag="latest"){
  const p=state.parity,n=tag==="latest"||tag==="pending"?p.head:tag==="earliest"?100:typeof tag==="object"?Object.keys(p.headers).find(n=>same(p.headers[n].hash,tag.blockHash)):Number(BigInt(tag));
  if(!Number.isSafeInteger(Number(n))||!p.snapshots[n])throw Error("Unknown fixture block");
  return p.snapshots[n];
}
function parityStreamAt(ledger,id){const row=ledger.streams[String(id)];if(!row)throw Error("Fixture StreamNotFound");return row;}
function parityVested(s,at){const time=s.canceledAt??at;if(time<=s.start)return 0n;if(time>=s.end)return s.deposit;return s.deposit*(time-s.start)/(s.end-s.start);}
const allowanceKey=(owner,spender)=>lower(owner)+":"+lower(spender);
function parityTransfer(ledger,from,to,amount){
  const a=lower(from),b=lower(to);if(amount<0n||(ledger.balances[a]||0n)<amount)throw Error("Fixture insufficient token balance");
  ledger.balances[a]=(ledger.balances[a]||0n)-amount;ledger.balances[b]=(ledger.balances[b]||0n)+amount;
}
function parityEvent(address,abi,eventName,args){
  const event=abi.find(e=>e.type==="event"&&e.name===eventName),plain=event.inputs.filter(i=>!i.indexed);
  return {address,topics:encodeEventTopics({abi,eventName,args}),data:encodeAbiParameters(plain,plain.map(i=>args[i.name]))};
}
function parityConservation(ledger){
  const sum=Object.values(ledger.balances).reduce((a,b)=>a+b,0n);
  const escrow=Object.values(ledger.streams).reduce((a,s)=>a+(s.canceledAt===null?s.deposit:parityVested(s,ledger.at))-s.withdrawn,0n);
  if(sum!==ledger.totalSupply||escrow!==(ledger.balances[lower(STREAM)]||0n)||Object.values(ledger.balances).some(b=>b<0n))throw Error("Fixture conservation invariant");
}
function parityDecode(input){
  if(!input||![A,B,C].some(a=>same(a,input.from))||!/^0x[\da-f]{8,}$/i.test(input.data||"")||BigInt(input.value||"0x0")!==0n)throw Error("Invalid fixture transaction identity");
  const abi=same(input.to,USDC)?parityTokenAbi:same(input.to,STREAM)?parityNftAbi:same(input.to,MARKET)?parityMarketAbi:null;
  if(!abi)throw Error("Fixture target forbidden");
  const decoded=decodeFunctionData({abi,data:input.data});
  const canonical=encodeFunctionData({abi,functionName:decoded.functionName,args:decoded.args});
  if(lower(canonical)!==lower(input.data))throw Error("Noncanonical fixture calldata");
  return {...decoded,abi};
}
function parityExecute(ledger,input,hash=HASH){
  const {functionName:name,args=[],abi}=parityDecode(input),from=input.from,logs=[],at=ledger.at;
  const emit=(address,eventAbi,event,args)=>logs.push(parityEvent(address,eventAbi,event,args));
  const tokenTransfer=(from,to,amount)=>{parityTransfer(ledger,from,to,amount);emit(USDC,parityTokenAbi,"Transfer",{from,to,value:amount});};
  let result;
  if(same(input.to,USDC)){
    if(name==="approve"){
      const [spender,amount]=args;if(![MARKET,STREAM].some(a=>same(a,spender)))throw Error("Fixture spender forbidden");
      ledger.allowances[allowanceKey(from,spender)]=amount;emit(USDC,parityTokenAbi,"Approval",{owner:from,spender,value:amount});result=true;
    }else if(name==="mint"){
      const [to,amount]=args;if(![A,B,C].some(a=>same(a,to))||amount<=0n||ledger.totalSupply+amount>=2n**256n)throw Error("Invalid fixture mint");
      ledger.balances[lower(to)]=(ledger.balances[lower(to)]||0n)+amount;ledger.totalSupply+=amount;emit(USDC,parityTokenAbi,"Transfer",{from:ZERO_ADDRESS,to,value:amount});
    }else throw Error("Fixture read is not a transaction");
  }else if(same(input.to,STREAM)&&name==="createStream"){
    const [recipient,token,amount,start,end,cancelable]=args,key=allowanceKey(from,STREAM);
    if(same(recipient,ZERO_ADDRESS)||!same(token,USDC)||amount<=0n||end<=start||end>=2n**64n||(ledger.allowances[key]||0n)<amount)throw Error("Invalid fixture creation");
    tokenTransfer(from,STREAM,amount);ledger.allowances[key]-=amount;
    result=ledger.nextId++;const id=String(result);
    ledger.streams[id]={id,sender:from,recipient,owner:recipient,token,deposit:amount,withdrawn:0n,start,end,cancelable,canceledAt:null,createdHash:hash,listing:null,claims:[]};
    ledger.approved[id]=ZERO_ADDRESS;emit(STREAM,parityNftAbi,"Transfer",{from:ZERO_ADDRESS,to:recipient,tokenId:result});
    emit(STREAM,parityNftAbi,"StreamCreated",{streamId:result,sender:from,recipient,token,depositedAmount:amount,startTime:start,endTime:end,cancelable});
  }else{
    const id=String(args[0]),s=parityStreamAt(ledger,id),vested=parityVested(s,at),listing=s.listing?.status==="ACTIVE"?s.listing:null;
    if(same(input.to,STREAM)){
      if(name==="claim"){
        if(!same(s.owner,from)||vested<=s.withdrawn)throw Error("Fixture NothingToClaim");
        result=vested-s.withdrawn;s.withdrawn+=result;tokenTransfer(STREAM,from,result);
        emit(STREAM,parityNftAbi,"StreamClaimed",{streamId:BigInt(id),recipient:from,amount:result});
        s.claims.push({id:hash,streamId:id,recipient:from,amount:result,claimedAt:iso(at),transactionHash:hash,logIndex:logs.length-1});
      }else if(name==="cancel"){
        if(!same(s.sender,from)||!s.cancelable||s.canceledAt!==null)throw Error("Fixture cancellation forbidden");
        s.canceledAt=at;result=s.deposit-vested;if(result>0n)tokenTransfer(STREAM,from,result);
        emit(STREAM,parityNftAbi,"StreamCanceled",{streamId:BigInt(id),sender:from,recipient:s.owner,vestedAmount:vested,senderRefund:result});
      }else throw Error("Fixture read is not a transaction");
    }else if(name==="list"){
      if(!same(s.owner,from)||listing||args[1]<=0n||!same(ledger.approved[id],MARKET))throw Error("Fixture listing forbidden");
      s.listing=parityListing(id,from,args[1],at);s.listing.listingTxHash=hash;
      emit(MARKET,parityMarketAbi,"Listed",{streamId:BigInt(id),seller:from,price:args[1]});
    }else if(name==="cancelListing"){
      if(!listing||!same(listing.seller,from))throw Error("Fixture NotSeller");
      listing.status="CANCELED";listing.canceledAt=at;emit(MARKET,parityMarketAbi,"ListingCanceled",{streamId:BigInt(id),seller:from});
    }else if(name==="buyWithProtection"){
      const [,maxPrice,minRemaining,maxWithdrawn,expectedSeller]=args,remaining=(s.canceledAt===null?s.deposit:vested)-s.withdrawn,key=allowanceKey(from,MARKET);
      if(!listing||!same(listing.seller,s.owner)||!same(listing.seller,expectedSeller)||same(expectedSeller,ZERO_ADDRESS)||listing.price>maxPrice||s.withdrawn>maxWithdrawn||remaining<minRemaining||!same(ledger.approved[id],MARKET)||(ledger.allowances[key]||0n)<listing.price)throw Error("Fixture protected purchase rejected");
      tokenTransfer(from,listing.seller,listing.price);if(ledger.allowances[key]!==2n**256n-1n)ledger.allowances[key]-=listing.price;
      const seller=s.owner;s.owner=from;ledger.approved[id]=ZERO_ADDRESS;listing.status="SOLD";listing.soldAt=at;listing.boughtTxHash=hash;listing.buyer=from;
      emit(STREAM,parityNftAbi,"Transfer",{from:seller,to:from,tokenId:BigInt(id)});
      emit(MARKET,parityMarketAbi,"Purchased",{streamId:BigInt(id),seller,buyer:from,price:listing.price});
      ledger.trades.push({id:hash,streamId:id,seller,buyer:from,price:listing.price,tradedAt:iso(at),transactionHash:hash,logIndex:logs.length-1});
    }else throw Error("Fixture market transaction unsupported");
  }
  parityConservation(ledger);return {result,logs,abi,name};
}
function parityNftApproval(ledger,input){
  const {args}=parityDecode(input),[approved,id]=args,s=parityStreamAt(ledger,id);
  if(!same(s.owner,input.from)||![MARKET,ZERO_ADDRESS].some(a=>same(a,approved)))throw Error("Fixture NotNftOwner");
  ledger.approved[String(id)]=approved;return {result:undefined,abi:parityNftAbi,name:"approve",logs:[parityEvent(STREAM,parityNftAbi,"Approval",{owner:s.owner,approved,tokenId:id})]};
}
function parityApply(ledger,input,hash){return same(input.to,STREAM)&&input.data.slice(0,10)===selectors.approve?parityNftApproval(ledger,input):parityExecute(ledger,input,hash);}
function parityAppend(ledger,transactions=[]){
  const p=state.parity,n=++p.head;p.snapshots[n]=structuredClone(ledger);p.headers[n]={at:ledger.at,hash:parityHash(n),transactions};state.at=ledger.at;
  return n;
}
function parityProject(){const p=state.parity;p.projectedBlock=p.head;state.projected=true;}
function parityMine(){
  const p=state.parity;
  if(p.head+2*p.queue.length>240)throw Error("Fixture block cap");
  for(const hash of p.queue.splice(0)){
    const tx=p.transactions[hash],before=paritySnapshot(),ledger=structuredClone(before);ledger.at=before.at+1n;
    let result,status="0x1";
    try{result=parityApply(ledger,tx,hash);}catch{status="0x0";result={logs:[]};Object.assign(ledger,structuredClone(before));ledger.at=before.at+1n;}
    const n=parityAppend(ledger,[hash]),blockHash=parityHash(n);
    tx.blockNumber=toHex(n);tx.blockHash=blockHash;tx.transactionIndex="0x0";
    const logs=result.logs.map((log,index)=>({...log,blockNumber:toHex(n),blockHash,transactionHash:hash,transactionIndex:"0x0",logIndex:toHex(index),removed:false}));
    p.receipts[hash]={transactionHash:hash,transactionIndex:"0x0",blockHash,blockNumber:toHex(n),from:tx.from,to:tx.to,cumulativeGasUsed:"0xc350",gasUsed:"0xc350",effectiveGasPrice:"0x77359400",contractAddress:null,logs,logsBloom:"0x"+"0".repeat(512),status,type:"0x0"};
    const confirmed=structuredClone(ledger);confirmed.at+=1n;parityAppend(confirmed);
  }
  if(p.autoProject)parityProject();else state.projected=p.projectedBlock===p.head;
}
function paritySubmit(input){
  const p=state.parity;if(state.sendCount>=40||p.queue.length>=4||p.head+2*(p.queue.length+1)>240)throw Error("Fixture transaction cap");
  const decoded=parityDecode(input),allowed=["approve","list","cancelListing","buyWithProtection","cancel","claim","mint","createStream"];
  if(!allowed.includes(decoded.functionName))throw Error("Fixture read is not a transaction");
  parityApply(structuredClone(paritySnapshot()),input,HASH);
  const account=lower(input.from),nonce=p.nonces[account]||0;if(input.nonce!==undefined&&BigInt(input.nonce)!==BigInt(nonce))throw Error("Fixture nonce mismatch");
  const hash=toHex(0xa000n+BigInt(++state.sendCount),{size:32});
  p.nonces[account]=nonce+1;
  const tx={hash,from:input.from,to:input.to,data:input.data,input:input.data,value:"0x0",nonce:toHex(nonce),chainId:"0xaa36a7",gas:"0xc350",gasPrice:"0x77359400",type:"0x0",r:ZERO,s:ZERO,v:"0x1b",blockHash:null,blockNumber:null,transactionIndex:null};
  p.transactions[hash]=tx;state.transactions[hash]=tx;state.tx=tx;p.queue.push(hash);if(!p.miningPaused)parityMine();return hash;
}
function parityBlock(tag="latest",full=false){
  const p=state.parity,n=tag==="latest"||tag==="pending"?p.head:Number(BigInt(tag)),header=p.headers[n];if(!header)throw Error("Unknown fixture block");
  return {...block(n,full),number:toHex(n),hash:header.hash,parentHash:parityHash(n-1),timestamp:toHex(header.at),transactions:header.transactions.map(hash=>full?p.transactions[hash]:hash)};
}
function parityApiStream(s,ledger){
  const vested=parityVested(s,ledger.at),listing=s.listing;
  return {streamId:s.id,sender:s.sender,recipient:s.recipient,currentOwner:s.owner,token:s.token,depositedAmount:String(s.deposit),withdrawnAmount:String(s.withdrawn),startTime:iso(s.start),endTime:iso(s.end),cancelable:s.cancelable,canceledAt:s.canceledAt===null?null:iso(s.canceledAt),createdTxHash:s.createdHash,
    computed:{vestedAmount:String(vested),claimableEstimate:String(vested-s.withdrawn),remainingReceivable:String((s.canceledAt===null?s.deposit:vested)-s.withdrawn),estimateTimestamp:iso(ledger.at)},claims:s.claims,
    listing:listing?{...listing,price:String(listing.price),listedAt:iso(listing.listedAt),soldAt:listing.soldAt===null?null:iso(listing.soldAt),canceledAt:listing.canceledAt===null?null:iso(listing.canceledAt)}:null};
}
function parityProjection(){
  const p=state.parity,at=p.snapshots[p.projectedBlock].at;
  return {chainId:11155111,syncId:"sepolia-v4",status:"synced",projectionStatus:p.projectedBlock===p.head?"applied":"pending",latestProjectedBlock:String(p.projectedBlock),latestIndexedBlock:String(p.head),latestProjectedBlockTimestamp:iso(at),estimateAt:iso(at)};
}
function parityStatus(){const p=state.parity;return {mode:state.mode,apiRequests:state.apiRequests,rpcRequests:state.rpcRequests,sendCount:state.sendCount,receiptReads:state.receiptReads,lastMethods:state.lastMethods,projected:state.projected,
  at:state.at,head:p.head,projectedBlock:p.projectedBlock,miningPaused:p.miningPaused,autoProject:p.autoProject,pendingHashes:p.queue,lastHash:state.tx?.hash||null,market:MARKET,nonces:p.nonces,
  balances:paritySnapshot().balances,projectionBalances:p.snapshots[p.projectedBlock].balances,escrow:paritySnapshot().balances[lower(STREAM)]};}
async function parityRpc(method,params){
  const p=state.parity;
  if(method==="eth_chainId")return "0xaa36a7";
  if(method==="eth_blockNumber")return toHex(p.head);
  if(method==="eth_getBlockByNumber")return parityBlock(params[0],Boolean(params[1]));
  if(method==="eth_getBlockByHash"){const n=Object.keys(p.headers).find(n=>same(p.headers[n].hash,params[0]));return n?parityBlock(toHex(Number(n)),Boolean(params[1])):null;}
  if(method==="eth_getCode")return [STREAM,USDC,MARKET].some(a=>same(a,params[0]))?"0x60006000":"0x";
  if(method==="eth_getTransactionCount")return toHex(params[1]==="pending"?(p.nonces[lower(params[0])]||0):Object.values(p.transactions).filter(tx=>same(tx.from,params[0])&&tx.blockNumber!==null).length);
  if(method==="eth_getBalance")return toHex(10n**15n);
  if(method==="eth_gasPrice")return toHex(2000000000n);
  if(method==="eth_maxPriorityFeePerGas")return toHex(800000000n);
  if(method==="eth_getTransactionByHash")return p.transactions[params[0]]||null;
  if(method==="eth_getTransactionReceipt"){state.receiptReads++;return p.receipts[params[0]]||null;}
  if(!["eth_call","eth_estimateGas"].includes(method))throw Error("Unsupported parity fixture RPC "+method);
  const input=params[0],ledger=paritySnapshot(params[1]),target=input.to;
  const abi=same(target,USDC)?parityTokenAbi:same(target,STREAM)?parityNftAbi:same(target,MARKET)?parityMarketAbi:null;
  if(!abi)throw Error("Fixture read target forbidden");
  const {functionName:name,args=[]}=decodeFunctionData({abi,data:input.data}),s=["ownerOf","getApproved","getStream","vestedAmount","claimableAmount","getListing"].includes(name)?parityStreamAt(ledger,args[0]):null;
  let result;
  if(same(target,USDC)&&name==="decimals")result=6;
  else if(same(target,USDC)&&name==="balanceOf")result=ledger.balances[lower(args[0])]||0n;
  else if(same(target,USDC)&&name==="allowance")result=ledger.allowances[allowanceKey(...args)]||0n;
  else if(name==="paymentToken")result=USDC;
  else if(name==="receivableNft")result=STREAM;
  else if(name==="getListing")result=s.listing?.status==="ACTIVE"?{seller:s.listing.seller,price:s.listing.price}:{seller:ZERO_ADDRESS,price:0n};
  else if(name==="ownerOf")result=s.owner;
  else if(name==="getApproved")result=ledger.approved[s.id]||ZERO_ADDRESS;
  else if(name==="isApprovedForAll")result=false;
  else if(name==="getStream")result={sender:s.sender,token:s.token,depositedAmount:s.deposit,startTime:s.start,endTime:s.end,withdrawnAmount:s.withdrawn,cancelable:s.cancelable,canceled:s.canceledAt!==null,canceledAt:s.canceledAt??0n};
  else if(name==="vestedAmount")result=parityVested(s,ledger.at);
  else if(name==="claimableAmount")result=parityVested(s,ledger.at)-s.withdrawn;
  else result=parityApply(structuredClone(ledger),input,HASH).result;
  return method==="eth_estimateGas"?"0xc350":encodeFunctionResult({abi,functionName:name,result});
}
async function rpc(method,params=[]){
  state.rpcRequests++;state.lastMethods.push(method);state.lastMethods=state.lastMethods.slice(-12);
  if(state.rpcRequests>1500)throw Error("fixture request cap");
  if(isParityMode())return parityRpc(method,params);
  if(state.mode==="E05-balance"&&["eth_getBalance","eth_call"].includes(method))throw Error("fixture balance RPC unavailable");
  if(state.mode==="E05-eth-balance"&&method==="eth_getBalance")throw Error("fixture native balance RPC unavailable");
  if(state.mode==="E05-token-balance"&&method==="eth_call"&&same(params[0]?.to,USDC)&&params[0]?.data?.slice(0,10)===selectors.balanceOf)throw Error("fixture token balance RPC unavailable");
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
  if(selector===selectors.balanceOf){if(state.mode==="B25-zero-assets")return uint(0);if(state.mode==="E16-balance"&&state.changed)return uint(999999);const address=`0x${data.slice(-40)}`.toLowerCase();const paid=state.tx?.kind==="claim"&&state.projected&&!["E19-replaced","E20-revert"].includes(state.mode)&&!state.mode.startsWith("E22-");const initial=address===A?10000000n:2000000n+BigInt(historyCount())*50000n+(paid?state.claimable:0n);const cancellation=state.mode==="B31-cancelled"?(address===A?550000n:address===B?100000n:0n):0n;const debit=state.tx?.kind==="create"&&state.projected&&state.tx.from.toLowerCase()===address?BigInt(state.tx.args[2]):0n;return uint(initial+cancellation-debit);}
  if(selector===selectors.allowance)return uint(state.mode==="E16-allowance"&&state.changed?0n:state.allowance);
  if(state.mode==="B31-cancelled"&&[selectors.ownerOf,selectors.getStream,selectors.claimableAmount].includes(selector)){
    const {args}=decodeFunctionData({abi,data}),row=stream(String(args[0]));
    if(!["3","4"].includes(row.streamId))throw Error("Unknown cancellation fixture stream");
    if(selector===selectors.ownerOf)return encodeAbiParameters([{type:"address"}],[row.currentOwner]);
    if(selector===selectors.claimableAmount)return uint(row.computed.claimableEstimate);
    return encodeAbiParameters([{type:"tuple",components:[{type:"address"},{type:"address"},{type:"uint256"},{type:"uint64"},{type:"uint64"},{type:"uint256"},{type:"bool"},{type:"bool"},{type:"uint64"}]}],[[row.sender,row.token,BigInt(row.depositedAmount),BigInt(Date.parse(row.startTime)/1000),BigInt(Date.parse(row.endTime)/1000),BigInt(row.withdrawnAmount),row.cancelable,Boolean(row.canceledAt),row.canceledAt?BigInt(Date.parse(row.canceledAt)/1000):0n]]);
  }
  if(selector===selectors.ownerOf)return encodeAbiParameters([{type:"address"}],[state.mode==="E16-owner"&&state.changed?A:B]);
  if(selector===selectors.claimableAmount)return uint(state.tx&&state.tx.kind==="claim"?0:state.claimable);
  if(selector===selectors.getStream)return encodeAbiParameters([{type:"tuple",components:[{type:"address"},{type:"address"},{type:"uint256"},{type:"uint64"},{type:"uint64"},{type:"uint256"},{type:"bool"},{type:"bool"},{type:"uint64"}]}],[[A,USDC,state.mode==="B22-one"?1n:1000000n,state.at-1000n,state.at-1n,state.mode==="B22-one"&&state.tx?.kind==="claim"?1n:state.mode==="E16-withdrawn"&&state.changed?1n:0n,true,false,0n]]);
  if(selector===selectors.claim){if(state.mode==="E08-simulate")throw Error("execution reverted: fixture simulation");return uint(state.claimable);}
  if(selector===selectors.approve)return uint(1);
  if(selector===selectors.createStream)return uint(5);
  throw Error(`Unknown fixture selector ${selector}`);
}
const send=(res,value,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(value,(_key,value)=>typeof value==="bigint"?String(value):value));};
async function body(req){let value="",bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>32768)throw Error("Body too large");value+=chunk;}return value?JSON.parse(value):{};}
export const server=http.createServer(async(req,res)=>{
  if(req.headers.host!=="127.0.0.1:"+server.address()?.port){send(res,{error:"Host forbidden"},403);return;}
  const origin=req.headers.origin;if(origin&&!["http://127.0.0.1:4212","http://127.0.0.1:4213"].includes(origin)){send(res,{error:"Origin forbidden"},403);return;}
  if(origin)res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");res.setHeader("Cache-Control","no-store");
  if(req.method==="OPTIONS"){res.writeHead(204);res.end();return;}
  try{
    if(req.url==="/qa/status"){send(res,isParityMode()?parityStatus():{...state,at:String(state.at),allowance:String(state.allowance),claimable:String(state.claimable)});return;}
    if(req.url==="/qa/case"&&req.method==="POST"){const {mode}=await body(req);if(typeof mode!=="string"||mode.length>40)throw Error("Invalid mode");reset(mode);send(res,{ok:true});return;}
    if(req.url==="/qa/failure"&&req.method==="POST"){state.failed=true;send(res,{ok:true});return;}
    if(req.url==="/qa/history-failure"&&req.method==="POST"){if(isParityMode())state.historyFailed=true;else state.mode="E06-trades";send(res,{ok:true});return;}
    if(req.url==="/qa/applied"&&req.method==="POST"){if(isParityMode())parityProject();else state.projected=true;send(res,{ok:true});return;}
    if(req.url==="/qa/change"&&req.method==="POST"){
      state.changed=true;
      if(isParityMode()){const ledger=structuredClone(paritySnapshot());ledger.at+=1n;const listing=ledger.streams["3"].listing;if(listing?.status==="ACTIVE")listing.price+=1n;parityAppend(ledger);state.projected=false;}
      send(res,{ok:true});return;
    }
    if(req.url==="/qa/recover"&&req.method==="POST"){if(isParityMode()){state.failed=false;state.historyFailed=false;parityMine();parityProject();}else{state.mode="normal";state.failed=false;state.projected=true;}send(res,{ok:true});return;}
    if(isParityMode()&&req.method==="POST"&&["/qa/mining","/qa/mine","/qa/projection","/qa/advance"].includes(req.url)){
      const input=await body(req),p=state.parity;
      if(req.url==="/qa/mining"){if(typeof input.paused!=="boolean")throw Error("Invalid mining control");p.miningPaused=input.paused;if(!input.paused)parityMine();}
      if(req.url==="/qa/mine")parityMine();
      if(req.url==="/qa/projection"){if(typeof input.paused!=="boolean")throw Error("Invalid projection control");p.autoProject=!input.paused;if(p.autoProject)parityProject();}
      if(req.url==="/qa/advance"){if(!Number.isSafeInteger(input.seconds)||input.seconds<1||input.seconds>3600)throw Error("Invalid fixture clock step");if(p.head+1+2*p.queue.length>240)throw Error("Fixture block cap");const ledger=structuredClone(paritySnapshot());ledger.at+=BigInt(input.seconds);parityAppend(ledger);if(p.autoProject)parityProject();else state.projected=false;}
      send(res,{ok:true});return;
    }
    if(req.url==="/qa/send"&&req.method==="POST"){
      if(isParityMode()){const input=await body(req);send(res,{hash:paritySubmit(input)});return;}
      if(scaledCount(state.mode)||["P02-harness","B31-cancelled"].includes(state.mode))throw Error("This fixture is read-only");
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
    if(state.failed||["E03-429","E03-500","E03-502","E03-503"].includes(state.mode)){send(res,{error:"injected HTTP failure"},state.failed?500:Number(state.mode.slice(-3)));return;}
    if(state.mode==="E03-json"){res.writeHead(200,{"Content-Type":"application/json"});res.end("not JSON");return;}
    if(state.mode==="E03-schema"){send(res,{data:[],meta:{}});return;}
    if(isParityMode()){
      const ledger=state.parity.snapshots[state.parity.projectedBlock],meta={projection:parityProjection()};
      const trades=req.url?.match(/^\/users\/(0x[\da-f]{40})\/trades$/i);
      if(trades){if(state.historyFailed){send(res,{error:"trades unavailable"},500);return;}send(res,{data:ledger.trades.filter(t=>same(t.seller,trades[1])||same(t.buyer,trades[1])),meta});return;}
      if(req.url==="/streams"){send(res,{data:Object.values(ledger.streams).map(s=>parityApiStream(s,ledger)),meta});return;}
      const detail=req.url?.match(/^\/streams\/(\d+)$/);
      if(detail){const row=ledger.streams[detail[1]];send(res,row?{data:parityApiStream(row,ledger),meta}:{error:"Fixture stream not found"},row?200:404);return;}
      send(res,{error:"Fixture route not found"},404);return;
    }
    if(req.url?.includes("/trades")){if(state.mode==="E06-trades"){send(res,{error:"trades unavailable"},500);return;}if(state.mode==="E26-late"&&req.url.toLowerCase().includes(A))await sleep(1800);send(res,{data:[],meta:{projection:projection()}});return;}
    if(req.url==="/streams"){const count=scaledCount(state.mode)||(["B25-empty","B25-zero-assets"].includes(state.mode)?0:state.mode==="B25-one"?1:2);const rows=scaledCount(state.mode)?Array.from({length:count},(_,i)=>stream(String(i+3))):[stream("3"),stream("4")].slice(0,count);if(state.tx?.kind==="create"&&state.projected)rows.push(stream("5"));send(res,{data:rows,meta:{projection:projection()}});return;}
    const match=req.url?.match(/^\/streams\/(\d+)$/);if(match){if(state.mode==="E06-detail"&&match[1]==="4"){send(res,{error:"history unavailable"},500);return;}const row=stream(match[1]);if(!row){send(res,{error:"Fixture stream not found"},404);return;}send(res,{data:row,meta:{projection:projection()}});return;}
    send(res,{error:"Fixture route not found"},404);
  }catch(error){if(!res.headersSent)send(res,{error:error.message},500);else res.end();}
});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)server.listen(4391,"127.0.0.1",()=>console.log("QA API/RPC ONLY http://127.0.0.1:4391 - no upstream network clients"));
