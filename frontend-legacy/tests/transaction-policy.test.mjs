import assert from "node:assert/strict";
import { test } from "node:test";
import { isWalletRejection, requiresProjection, projectionIncludes, streamLifecycle, visiblePollInterval, refreshAfterConfirmation } from "../lib/transaction-policy.ts";

test("ingestion alone cannot mark a confirmed transaction Indexed", () => {
  assert.equal(projectionIncludes(100n, undefined), false);
  assert.equal(projectionIncludes(100n, 99n), false);
  assert.equal(projectionIncludes(100n, 100n), true);
  assert.equal(projectionIncludes(undefined, 200n), false);
});
test("mint and approvals do not wait for projection, business actions do", () => {
  for (const label of ["Mint MockUSDC", "Approve Stream Escrow", "Approve Marketplace NFT Transfer", "Approve Marketplace Payment"]) assert.equal(requiresProjection(label), false);
  for (const label of ["Create Stream", "Claim Stream", "List Receivable", "Cancel Listing", "Buy Receivable"]) assert.equal(requiresProjection(label), true);
});
test("time and settlement states are distinct", () => {
  const stream = { canceled: false, depositedAmount: 100n, withdrawnAmount: 0n, startTime: 100n, endTime: 200n };
  assert.equal(streamLifecycle(stream, 0n, 99n), "Scheduled");
  assert.equal(streamLifecycle(stream, 0n, 100n), "Active");
  assert.equal(streamLifecycle(stream, 100n, 200n), "Ended");
  assert.equal(streamLifecycle({ ...stream, withdrawnAmount: 100n }, 100n, 200n), "Settled");
  assert.equal(streamLifecycle({ ...stream, canceled: true }, 50n, 150n), "Canceled");
  assert.equal(streamLifecycle({ ...stream, canceled: true, withdrawnAmount: 50n }, 50n, 150n), "Canceled / settled");
  assert.equal(streamLifecycle(stream, 0n, undefined), "Time unavailable");
});
test("visibility controls the 15 second polling interval", () => {
  assert.equal(visiblePollInterval(true), 15000);
  assert.equal(visiblePollInterval(false), false);
});
test("post-confirmation read failure returns warning instead of transaction rejection", async () => {
  let refreshed = false;
  const warning = await refreshAfterConfirmation([async () => { throw new Error("RPC unavailable"); }, async () => { refreshed = true; }]);
  assert.equal(refreshed, true);
  assert.match(warning, /Transaction succeeded/);
  assert.equal(await refreshAfterConfirmation([async () => undefined]), undefined);
});

test("wallet rejection traverses provider causes without confusing RPC errors or cycles",()=>{
 assert.equal(isWalletRejection({cause:{cause:{code:4001}}}),true);
 assert.equal(isWalletRejection({code:-32000,message:"User rejected"}),false);
 assert.equal(isWalletRejection(null),false);
 const cycle={};cycle.cause=cycle;assert.equal(isWalletRejection(cycle),false);
});
