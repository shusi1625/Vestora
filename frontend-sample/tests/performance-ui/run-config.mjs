const fixtureAddress = "0x2222222222222222222222222222222222222222";
const maxUint256 = (1n << 256n) - 1n;
const invalid = () => { throw new Error("Invalid QA public session manifest"); };

/** This public description selects reads; it never grants gateway approval. */
export function validatePublicManifest(value) {
  const keys = ["mode", "planDigest", "watchedAddress", "allowedPaths"];
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
  if (value.mode !== "actual-api" || typeof value.planDigest !== "string" || value.planDigest.length !== 64 || !/^[\da-f]{64}$/.test(value.planDigest)
    || typeof value.watchedAddress !== "string" || value.watchedAddress.length !== 42 || !/^0x[\da-f]{40}$/i.test(value.watchedAddress)) invalid();
  const watchedAddress = value.watchedAddress.toLowerCase();
  const required = ["/health", "/metrics", "/streams", `/users/${watchedAddress}/trades`];
  const paths = value.allowedPaths;
  if (!Array.isArray(paths) || paths.length < 4 || paths.length > 38 || new Set(paths).size !== paths.length
    || required.some(path => !paths.includes(path))) invalid();
  let details = 0;
  for (const path of paths) {
    if (typeof path !== "string") invalid();
    if (required.includes(path)) continue;
    const match = /^\/streams\/([1-9]\d{0,77})$/.exec(path);
    if (!match || path !== `/streams/${match[1]}` || BigInt(match[1]) > maxUint256 || ++details > 34) invalid();
  }
  return Object.freeze({ mode: "actual-api", planDigest: value.planDigest, watchedAddress,
    allowedPaths: Object.freeze([...paths]) });
}

/** readManifest is injected so config validation and tests need no filesystem. */
export function resolveQaRunConfig(env = {}, readManifest) {
  const mode = env.VESTORA_QA_MODE || "fixture";
  if (mode === "fixture") return Object.freeze({ mode, planDigest: "", watchedAddress: fixtureAddress,
    allowedPaths: Object.freeze([]), source: "LOCAL FIXTURE", outDir: "qa-ui-dist" });
  if (mode !== "actual-api") throw new Error("Invalid QA mode");
  const filename = env.VESTORA_QA_SESSION_MANIFEST;
  if (typeof filename !== "string" || filename !== filename.trim() || filename.includes("\0")) invalid();
  // Windows recognizes both separators in UNC and device namespace prefixes.
  if (/^[\\/]{2}/.test(filename) || /^[\\/]\?\?[\\/]/.test(filename)) invalid();
  if (!/^(?:[A-Za-z]:[\\/](?![\\/])|\/(?!\/))/.test(filename) || typeof readManifest !== "function") invalid();
  let manifest;
  try { manifest = validatePublicManifest(JSON.parse(readManifest(filename))); }
  catch { invalid(); }
  return Object.freeze({ ...manifest, source: "ACTUAL API VIA BOUNDED GATEWAY", outDir: "qa-ui-actual-dist" });
}

export function qaEnvironmentDefines(config) {
  const gateway = config.mode === "actual-api" ? "http://127.0.0.1:4394" : "http://127.0.0.1:4393";
  return Object.fromEntries(Object.entries({
    VITE_DATA_MODE: "live",
    VITE_VESTORA_API_URL: `${gateway}/api`,
    VITE_SEPOLIA_RPC_URL: `${gateway}/rpc-blocked`,
    VITE_QA_MODE: config.mode,
    VITE_QA_PLAN_DIGEST: config.planDigest,
    // A JSON string in both modes, matching Vite's string environment values.
    VITE_QA_ALLOWED_PATHS: JSON.stringify(config.allowedPaths),
    VITE_QA_WATCH_ADDRESS: config.watchedAddress,
    VITE_QA_SOURCE: config.source,
  }).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]));
}
