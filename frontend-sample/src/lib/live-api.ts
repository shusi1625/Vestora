import { z } from "zod";
import { LIVE_API_BASE, LIVE_SYNC_ID } from "./live-config";
import { uiMeasurement } from "@/lib/ui-measurement";

const uint = z.string().regex(/^\d+$/);
const address = z.string().regex(/^0x[\da-f]{40}$/i);
const hash = z.string().regex(/^0x[\da-f]{64}$/i);
const date = z.string().refine(v => Number.isFinite(Date.parse(v)));
export const projectionSchema = z.object({
  chainId:z.literal(11155111), syncId:z.literal(LIVE_SYNC_ID), status:z.string(),
  projectionStatus:z.enum(["not_started","applied","pending"]),
  latestProjectedBlock:uint.nullable(), latestIndexedBlock:uint,
  latestProjectedBlockTimestamp:date.nullable(), estimateAt:date.nullable(),
});
export const listingSchema = z.object({
  streamId:uint, seller:address, price:uint, status:z.enum(["ACTIVE","SOLD","CANCELED","INVALIDATED"]),
  listedAt:date, soldAt:date.nullable(), canceledAt:date.nullable(), invalidatedAt:date.nullable(),
  listingTxHash:hash, boughtTxHash:hash.nullable(), buyer:address.nullable(),
});
const claimSchema = z.object({ id:z.string(), streamId:uint, recipient:address, amount:uint, claimedAt:date, transactionHash:hash, logIndex:z.number().int().nonnegative() });
export const streamSchema = z.object({
  streamId:uint, sender:address, recipient:address, currentOwner:address.nullable(), token:address,
  depositedAmount:uint, withdrawnAmount:uint, startTime:date, endTime:date,
  cancelable:z.boolean(), canceledAt:date.nullable(), createdTxHash:hash,
  computed:z.object({ vestedAmount:uint.nullable(), claimableEstimate:uint.nullable(), remainingReceivable:uint.nullable(), estimateTimestamp:date.nullable() }),
  listing:listingSchema.nullable(), claims:z.array(claimSchema).optional(),
});
export const tradeSchema = z.object({ id:z.string(), streamId:uint, seller:address, buyer:address, price:uint, tradedAt:date, transactionHash:hash, logIndex:z.number().int().nonnegative() });
export const streamListSchema = z.object({ data:z.array(streamSchema), meta:z.object({ projection:projectionSchema }) });
export const detailSchema = z.object({ data:streamSchema, meta:z.object({ projection:projectionSchema }) });
export const tradeListSchema = z.object({ data:z.array(tradeSchema), meta:z.object({ projection:projectionSchema }) });
export type ApiStream = z.infer<typeof streamSchema>;
export type ApiTrade = z.infer<typeof tradeSchema>;
export type Projection = z.infer<typeof projectionSchema>;

export async function readApi<T>(path:string, schema:z.ZodType<T>, signal?:AbortSignal, batchId?:string):Promise<T> {
  const trace=uiMeasurement?.request(batchId,path);
  try{
    const response = await fetch(`${LIVE_API_BASE}${path}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
    trace?.headers(response.status,response.headers.get("X-QA-Request-ID"));
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    if(!trace)return schema.parse(await response.json());
    const body=await response.text();trace.body();
    const json:unknown=JSON.parse(body);trace.parsed();
    const parsed=schema.parse(json);trace.validated();return parsed;
  }catch(error){trace?.failed(error instanceof Error?error.name:"unknown");throw error;}
}
