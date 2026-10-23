import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { LIVE_RPC_URL, LIVE_USDC } from "./live-config";
import type { Amount } from "./types";

const client = createPublicClient({ chain:sepolia, transport:http(LIVE_RPC_URL,{timeout:12_000,retryCount:1}) });
export async function readBalances(address:Address, blockNumber:bigint) {
  if (await client.getChainId() !== sepolia.id) throw new Error("Unexpected RPC chain");
  const [decimals, raw, gasRaw] = await Promise.all([
    // Explicitly absent for viem's conditional types under this captured project's strictNullChecks=false.
    client.readContract({address:LIVE_USDC,abi:erc20Abi,functionName:"decimals",blockNumber,authorizationList:undefined}),
    client.readContract({address:LIVE_USDC,abi:erc20Abi,functionName:"balanceOf",args:[address],blockNumber,authorizationList:undefined}),
    client.getBalance({address,blockNumber}),
  ]);
  if (decimals !== 6) throw new Error("Unexpected token decimals");
  const balances:Amount[]=[{token:"MockUSDC",raw}];
  return { balances,gasRaw,blockNumber };
}
