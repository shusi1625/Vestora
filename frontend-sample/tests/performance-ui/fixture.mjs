import http from "node:http";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {scaledStream} from "../manual-qa/scaled-data.mjs";

export function createUiFixture({count=100,delayMs=0,mode="normal",clock=()=>Date.now()}={}){
  if(![100,1000].includes(count)||!Number.isInteger(delayMs)||delayMs<0||delayMs>5000||!["normal","pending","invalid-json","http-error","old-timestamp"].includes(mode))throw Error("Invalid isolated fixture configuration");
  let requests=0,denied=0,at=BigInt(Math.floor(clock()/1000));
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(origin&&!/^http:\/\/127\.0\.0\.1:434[01]$/.test(origin)){denied++;res.writeHead(403).end();return;}
    const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":origin||"http://127.0.0.1:4341","Access-Control-Expose-Headers":"X-QA-Request-ID","Cache-Control":"no-store"};
    if(req.method!=="GET"||!/^\/api\/(streams(?:\/[1-9]\d*)?|users\/0x2222222222222222222222222222222222222222\/trades)$/.test(req.url)||requests>=22000){denied++;res.writeHead(403,headers).end();return;}
    const id=++requests;headers["X-QA-Request-ID"]=`fixture-${id}`;
    if(req.url==="/api/streams")at=BigInt(Math.floor(clock()/1000))-(mode==="old-timestamp"?121n:0n);
    const iso=new Date(Number(at)*1000).toISOString(),projection={chainId:11155111,syncId:"sepolia-v4",status:"synced",projectionStatus:mode==="pending"?"pending":"applied",
      latestProjectedBlock:"100",latestIndexedBlock:mode==="pending"?"101":"100",latestProjectedBlockTimestamp:iso,estimateAt:iso};
    const stream=id=>scaledStream(`P01-${count}`,at,id);
    let data;
    if(req.url==="/api/streams")data=Array.from({length:count},(_,i)=>stream(String(i+3)));
    else if(req.url.endsWith("/trades"))data=[];
    else data=stream(req.url.split("/").at(-1));
    if(!data){res.writeHead(404,headers).end('{"error":"not-found"}');return;}
    if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
    if(res.destroyed)return;
    res.writeHead(mode==="http-error"?503:200,headers);res.end(mode==="invalid-json"?"invalid json":JSON.stringify({data,meta:{projection}}));
  });
  return {server,status:()=>({scope:"loopback synthetic fixture only",count,mode,requests,denied,upstreamRequests:0,walletRequests:0,rpcRequests:0})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const fixture=createUiFixture({count:Number(process.argv[2]??100),delayMs:Number(process.argv[3]??0),mode:process.argv[4]??"normal"});
  fixture.server.listen(4393,"127.0.0.1",()=>console.log(JSON.stringify({url:"http://127.0.0.1:4393/api",...fixture.status()})));
}
