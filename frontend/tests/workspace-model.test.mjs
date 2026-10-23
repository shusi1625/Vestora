import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const cache = new Map();
function load(file) {
  const path = resolve(root, file.endsWith(".ts") ? file : `${file}.ts`);
  if (cache.has(path)) return cache.get(path);
  const module = { exports: {} }; cache.set(path, module.exports);
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const localRequire = id => {
    assert.ok(id.startsWith(".") || id.startsWith("@/"), `Unexpected model dependency: ${id}`);
    return load(id.startsWith("@/") ? resolve(root, "src", id.slice(2)) : resolve(dirname(path), id));
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Date, BigInt, Intl })(localRequire, module, module.exports);
  return module.exports;
}
const model = load("src/lib/workspace-model");
const format = load("src/lib/format");
const now = new Date("2026-10-19T00:00:00Z");
const base = { id: "1", token: "MockUSDC", payer: "0xAA", originalRecipient: "0xBB", owner: "0xCC", deposited: 1000n, claimed: 100n, startAt: "2026-10-09T00:00:00Z", endAt: "2026-10-29T00:00:00Z", cancellable: true, ownership: "verified" };
function equalAmounts(actual, expected) { for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, key); }

test("reused listing totals equal the original path at financial boundaries", () => {
  const math=load("src/lib/claim-math");
  for(const claim of [base,{...base,cancelledAt:"2026-10-18T00:00:00Z"},{...base,deposited:0n,claimed:0n},{...base,claimed:1000n},{...base,deposited:10n**32n,valuation:{at:now.toISOString(),vestedRaw:10n**31n}}]){
    for(const at of [new Date("2026-10-01T00:00:00Z"),now,new Date("2026-11-01T00:00:00Z")])for(const priceRaw of [0n,1n,850n,10n**33n]){
      const listing={id:"listing-1",claimId:claim.id,seller:claim.owner,status:"active",priceRaw};
      const totals=math.getClaimTotals(claim,at);
      assert.deepEqual(math.getListingMetrics(claim,listing,at,totals),math.getListingMetrics(claim,listing,at));
    }
  }
});
test("stream accounting conserves the entire deposit", () => {
  const v = model.issuedAmounts(base, now);
  equalAmounts(v, { remaining:900n, claimable:400n, future:500n, refundable:500n, returned:0n });
  assert.equal(v.deposited, v.claimed + v.claimable + v.future + v.returned);
});
test("cancellation preserves vested rights and returns only unvested money", () => {
  const v = model.issuedAmounts({ ...base, cancelledAt:"2026-10-19T00:00:00Z" }, new Date("2027-01-01Z"));
  equalAmounts(v, { remaining:400n, claimable:400n, future:0n, returned:500n, refundable:0n });
  assert.equal(v.deposited, v.claimed + v.remaining + v.returned);
});
test("ending a payment is distinct from fully claiming it", () => {
  const date = new Date("2026-10-30Z");
  equalAmounts(model.issuedAmounts(base,date), { claimable:900n, future:0n, remaining:900n });
  assert.equal(model.paymentPhase(base,date), "completed");
  equalAmounts(model.issuedAmounts({ ...base, claimed:1000n },date), { remaining:0n });
});
test("before start there is no vested claim and a cancellable deposit can be refunded", () => {
  const c = { ...base, claimed:0n }, date = new Date("2026-10-01Z");
  equalAmounts(model.issuedAmounts(c,date), { claimable:0n, future:1000n, refundable:1000n });
  assert.equal(model.paymentPhase(c,date), "scheduled");
});
test("issuer and current NFT owner use separate account selectors", () => {
  const claims = [base, { ...base, id:"2", payer:"0xCC", token:"mWETH" }];
  assert.equal(model.issuedSummary(claims,"0xaa","MockUSDC",now).count,1);
  assert.equal(model.issuedSummary(claims,"0xBB","MockUSDC",now).count,0);
  const portfolio = model.portfolioForToken(claims,[{ token:"MockUSDC",raw:50n }],"0xcc","MockUSDC",now);
  equalAmounts(portfolio, { wallet:50n, claimable:400n, future:500n, total:950n });
  assert.equal(model.portfolioForToken(claims,[],"0xbb","MockUSDC",now).owned.length,0);
  assert.equal(model.sameAddress(null,null),false);
});
test("purchases and personal receipts cannot be inferred from global withdrawals", () => {
  const records = [
    { claimId:"1",accountKey:"A",kind:"buy",phase:"completed",amountRaw:850n,requestedAt:"2026-10-15Z" },
    { claimId:"1",accountKey:"A",kind:"claim",phase:"completed",amountRaw:20n },
    { claimId:"1",accountKey:"B",kind:"claim",phase:"completed",amountRaw:80n },
    { claimId:"1",accountKey:"A",kind:"claim",phase:"failed-onchain",amountRaw:40n },
  ];
  const acquisition = model.acquisitionFor(base,records,"A");
  assert.equal(acquisition.received,20n); assert.equal(acquisition.purchase.amountRaw,850n);
  assert.equal(model.acquisitionFor(base,records,"C").purchase,undefined);
});
test("large amounts never pass through floating point accounting", () => {
  const deposited = 10n ** 32n, claimed = 10n ** 30n;
  const v = model.issuedAmounts({ ...base, deposited, claimed },now);
  assert.equal(v.claimable,deposited/2n-claimed);
  assert.equal(v.deposited,v.claimed+v.remaining);
});

test("nonzero sub-display amounts never render as zero, including negative amounts", () => {
  for (const token of ["MockUSDC", "mWETH", "ETH"]) {
    assert.equal(format.formatUnits(1n, token), format.formatFullUnits(1n, token));
    assert.equal(format.formatUnits(-1n, token), format.formatFullUnits(-1n, token));
  }
  assert.equal(format.formatUnits(0n, "MockUSDC"), "0.00");
  assert.equal(format.formatUnits(4999n, "MockUSDC"), "0.004999");
  assert.equal(format.formatUnits(5000n, "MockUSDC"), "0.01");
  assert.equal(format.formatUnits(123456789n, "MockUSDC"), "123.46");
  assert.equal(format.formatUnits(10n ** 30n, "MockUSDC"), "1,000,000,000,000,000,000,000,000.00");
});

test("precision disclosure compares like units instead of scaled raw amounts", () => {
  assert.equal(format.hasHiddenPrecision(1000000n, "MockUSDC"), false);
  assert.equal(format.hasHiddenPrecision(0n, "MockUSDC"), false);
  assert.equal(format.hasHiddenPrecision(1000001n, "MockUSDC"), true);
  assert.equal(format.hasHiddenPrecision(-1000001n, "MockUSDC"), true);
  assert.equal(format.hasHiddenPrecision(1n, "MockUSDC", 6), false);
  assert.equal(format.hasHiddenPrecision(1n, "MockUSDC", 7), false);
  assert.equal(format.hasHiddenPrecision(10n ** 18n, "mWETH"), false);
  assert.equal(format.hasHiddenPrecision(10n ** 18n + 1n, "mWETH"), true);
});
test("all integrated static translation keys exist", () => {
  const locale = JSON.parse(readFileSync(resolve(root,"public/locales/ko.json"),"utf8"));
  function walk(path) { return readdirSync(path,{ withFileTypes:true }).flatMap(e => e.isDirectory() ? walk(resolve(path,e.name)) : [resolve(path,e.name)]); }
  const files = walk(resolve(root,"src")).filter(p => extname(p) === ".tsx" && (p.includes("workspace") || p.includes("Workspace") || /pages[\\/](issued|sales|transactions)/.test(p) || p.includes("AssetComposition")));
  for (const file of files) for (const match of readFileSync(file,"utf8").matchAll(/["'](workspace\.[\w.-]+)["']/g)) assert.ok(locale[match[1]], `${file}: ${match[1]}`);
  for (const [prefix, keys] of Object.entries({ phase:["scheduled","streaming","completed","cancelled"], asset:["wallet","claimable","future"], fund:["claimed","claimable","future","returned"], summary:["remaining","claimable","future","refundable","deposited","claimed","returned"], sale:["active","sold","unlisted","void","all"], txKind:["create","approve","list","unlist","buy","claim","cancel-payment"] })) for (const key of keys) assert.ok(locale[`workspace.${prefix}.${key}`]);
});

const boundaryClaim={...base,claimed:0n,deposited:1001n,startAt:new Date(200000).toISOString(),endAt:new Date(203000).toISOString()};
test("B08 raw 2^53-1,2^53,2^53+1 remain distinct in portfolio aggregation",()=>{
  for(const raw of [2n**53n-1n,2n**53n,2n**53n+1n]){
    const claim={...boundaryClaim,owner:"0xCC",deposited:raw};const p=model.portfolioForToken([claim],[{token:"MockUSDC",raw}],"0xcc","MockUSDC",new Date(204000));
    assert.equal(p.wallet,raw);assert.equal(p.claimable,raw);assert.equal(p.total,2n*raw);
  }
});
test("B12 address case does not split owner or issuer account identity",()=>{
  const address="0xaBcDEF1234567890abcdef1234567890ABCDEF12";const claim={...boundaryClaim,payer:address,owner:address};
  for(const query of [address,address.toLowerCase(),address.toUpperCase()]){
    assert.equal(model.portfolioForToken([claim],[],query,"MockUSDC",new Date(204000)).total,1001n);
    assert.equal(model.issuedSummary([claim],query,"MockUSDC",new Date(204000)).count,1);
  }
});
test("B13 self-recipient principal is counted once in assets and separately in issued management",()=>{
  const claim={...boundaryClaim,owner:base.payer,originalRecipient:base.payer};const date=new Date(201000);
  const p=model.portfolioForToken([claim],[{token:"MockUSDC",raw:50n}],base.payer,"MockUSDC",date);
  assert.equal(p.total,1051n);assert.equal(model.issuedSummary([claim],base.payer,"MockUSDC",date).deposited,1001n);
});
test("B19 start S-1,S,S+1 seconds has no early or negative entitlement",()=>{
  for(const [time,claimable,future] of [[199,0n,1001n],[200,0n,1001n],[201,333n,668n]]){
    equalAmounts(model.issuedAmounts(boundaryClaim,new Date(time*1000)),{claimable,future});
  }
});
test("B20 end E-1,E,E+1 seconds preserves remainder and ending is not claiming",()=>{
  for(const [time,claimable,future] of [[202,667n,334n],[203,1001n,0n],[204,1001n,0n]]){
    equalAmounts(model.issuedAmounts(boundaryClaim,new Date(time*1000)),{claimable,future,claimed:0n});
  }
});
test("B21 one-raw and uneven deposits floor each point but settle exactly at end",()=>{
  for(const deposited of [1n,2n,1001n])for(const elapsed of [0n,1n,2n,3n,4n]){
    const v=model.issuedAmounts({...boundaryClaim,deposited},new Date(Number(200n+elapsed)*1000));
    const accrued=elapsed>=3n?deposited:deposited*elapsed/3n;assert.equal(v.claimable,accrued);assert.equal(v.claimable+v.future,deposited);
  }
});
test("B30 cancellation before S,at S,midpoint,at E,after E conserves every raw including prior claims",()=>{
  for(const time of [199n,200n,201n,203n,204n]){
    const vested=time<=200n?0n:time>=203n?1001n:1001n*(time-200n)/3n;
    for(const claimed of [0n,vested/2n,vested]){
      const v=model.issuedAmounts({...boundaryClaim,claimed,cancelledAt:new Date(Number(time)*1000).toISOString()},new Date(999000));
      assert.equal(v.claimable,vested-claimed);assert.equal(v.returned,1001n-vested);assert.equal(v.future,0n);
      assert.equal(v.claimed+v.claimable+v.returned,v.deposited);
    }
  }
});
