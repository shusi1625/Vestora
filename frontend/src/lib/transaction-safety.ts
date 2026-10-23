import {InsufficientFundsError} from "viem";

/** RPC estimate for the direct contract call, never a wallet-wide spending cap. */
export type GasEstimate={scope:"public-rpc-direct";gasLimit:bigint;maxFeePerGas:bigint;maxPriorityFeePerGas:bigint;maximumCost:bigint;balance:bigint};
export type SubmissionFailure={stage:"wallet";reason:"insufficient-funds"|"provider-response";at:number;code?:number};

export function gasEstimate(gasLimit:bigint,fees:{maxFeePerGas:bigint;maxPriorityFeePerGas:bigint},balance:bigint):GasEstimate{
  if(gasLimit<=0n||fees.maxFeePerGas<=0n||fees.maxPriorityFeePerGas<0n||fees.maxFeePerGas<fees.maxPriorityFeePerGas||balance<0n)throw new Error("claim.gasEstimateUnavailable");
  const maximumCost=gasLimit*fees.maxFeePerGas;
  if(balance<maximumCost)throw new Error("claim.gasInsufficient");
  return {scope:"public-rpc-direct",gasLimit,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,maximumCost,balance};
}

/** Diagnostic only: no error after requesting the wallet proves non-submission. */
export function submissionFailure(error:unknown,at:number):SubmissionFailure{
  const seen=new Set<object>();let current=error,code:number|undefined,gas=false;
  while(current&&typeof current==="object"&&!seen.has(current)&&seen.size<16){
    seen.add(current);if(current instanceof InsufficientFundsError)gas=true;
    const value=current as {code?:unknown;cause?:unknown};
    if(code===undefined&&typeof value.code==="number"&&Number.isSafeInteger(value.code))code=value.code;
    current=value.cause;
  }
  return {stage:"wallet",reason:gas?"insufficient-funds":"provider-response",at,...(code===undefined?{}:{code})};
}
export function validSubmissionFailure(value:unknown):value is SubmissionFailure{
  if(!value||typeof value!=="object")return false;
  const f=value as Partial<SubmissionFailure>;
  return f.stage==="wallet"&&typeof f.reason==="string"&&["insufficient-funds","provider-response"].includes(f.reason)&&typeof f.at==="number"&&Number.isSafeInteger(f.at)&&f.at>=0&&(f.code===undefined||Number.isSafeInteger(f.code));
}
export const submissionFailureMessage=(failure?:SubmissionFailure)=>failure?.reason==="insufficient-funds"?"claim.walletGasUnresolved":failure?"claim.walletResponseUnknown":undefined;
