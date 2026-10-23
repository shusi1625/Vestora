export type BrowserVitalsEntryType = "longtask" | "largest-contentful-paint" | "layout-shift" | "event";
type Kind = BrowserVitalsEntryType | "resource";
type ObserverStatus = "not-installed" | "observing" | "stopped" | "unsupported" | "failed";
type FailureStage = "support" | "constructor" | "observe" | "delivery" | "disconnect" | "read" | "environment" | "clock";

export type BrowserVitalsEnvironment = { visibility: string; focused: boolean };
export type BrowserVitalsTimingEntry = {
  name?: unknown;
  startTime?: unknown;
  duration?: unknown;
  interactionId?: unknown;
  processingStart?: unknown;
  processingEnd?: unknown;
  value?: unknown;
  hadRecentInput?: unknown;
  initiatorType?: unknown;
  transferSize?: unknown;
  encodedBodySize?: unknown;
  decodedBodySize?: unknown;
};
export type BrowserVitalsPerformance = {
  readonly timeOrigin?: number;
  getEntriesByType?: (type: string) => readonly BrowserVitalsTimingEntry[];
};
export type BrowserVitalsObserver = {
  observe: (options: { type: string; buffered: boolean; durationThreshold?: number }) => void;
  disconnect: () => void;
};
export type BrowserVitalsObserverConstructor = {
  new(callback: (list: { getEntries: () => readonly BrowserVitalsTimingEntry[] }) => void): BrowserVitalsObserver;
  readonly supportedEntryTypes?: readonly string[];
};
export type BrowserVitalsOptions = {
  performance: BrowserVitalsPerformance | undefined;
  Observer: BrowserVitalsObserverConstructor | undefined;
  clock: () => number;
  environment: () => BrowserVitalsEnvironment;
  maxEntries?: number;
  maxResources?: number;
};
export type BrowserVitalsEntry = {
  type: BrowserVitalsEntryType;
  startTime: number | null;
  duration: number | null;
  interactionId: number | null;
  processingStart: number | null;
  processingEnd: number | null;
  value: number | null;
  hadRecentInput: boolean | null;
  deliveredAt: number | null;
  environment: { visibility: string; focused: boolean | null };
};
export type BrowserVitalsResource = {
  url: string | null;
  initiatorType: string | null;
  startTime: number | null;
  duration: number | null;
  transferSize: number | null;
  encodedBodySize: number | null;
  decodedBodySize: number | null;
};
export type BrowserVitalsSnapshot = {
  installed: boolean;
  stopped: boolean;
  timeOrigin: number | null;
  supported: Kind[];
  unsupported: Kind[];
  status: Record<BrowserVitalsEntryType, ObserverStatus>;
  entries: BrowserVitalsEntry[];
  counts: Record<Kind, number | null>;
  dropped: number;
  resources: BrowserVitalsResource[];
  resourceStatus: "not-read" | "available" | "unsupported" | "failed" | "overflow-indeterminate";
  resourceDropped: number | null;
  resourceDroppedAtLeast: number;
  resourceIdentities: number;
  failures: { type: Kind; stage: FailureStage }[];
  limits: { entries: number; resources: number; resourceIdentities: number };
  notes: string[];
};
export type BrowserVitals = {
  install: () => void;
  stop: () => void;
  snapshot: () => BrowserVitalsSnapshot;
};

const TYPES: BrowserVitalsEntryType[] = ["longtask", "largest-contentful-paint", "layout-shift", "event"];
const RESOURCE_CAP = 500;
const RESOURCE_IDENTITY_CAP = 2000;
const INITIATORS = new Set(["audio", "beacon", "body", "css", "early-hint", "embed", "fetch", "font", "iframe", "image", "img", "input", "link", "navigation", "object", "other", "ping", "script", "track", "video", "xmlhttprequest"]);
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function resourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin + url.pathname : null;
  } catch {
    return null;
  }
}

export function createBrowserVitals({ performance, Observer, clock, environment, maxEntries = 2000, maxResources = RESOURCE_CAP }: BrowserVitalsOptions): BrowserVitals {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error("Invalid browser vitals entry cap");
  if (!Number.isSafeInteger(maxResources) || maxResources < 1 || maxResources > RESOURCE_IDENTITY_CAP) throw new Error("Invalid browser vitals resource cap");
  const entries: BrowserVitalsEntry[] = [], resources: BrowserVitalsResource[] = [];
  const observers = new Map<BrowserVitalsEntryType, BrowserVitalsObserver>();
  const identities = new Set<string>();
  const failures: BrowserVitalsSnapshot["failures"] = [];
  const status = Object.fromEntries(TYPES.map(type => [type, "not-installed"])) as BrowserVitalsSnapshot["status"];
  const counts = Object.fromEntries([...TYPES, "resource"].map(type => [type, null])) as BrowserVitalsSnapshot["counts"];
  let installed = false, stopped = false, dropped = 0, resourceDropped = 0, resourceOverflow = false;
  let resourceStatus: BrowserVitalsSnapshot["resourceStatus"] = "not-read";
  const failure = (type: Kind, stage: FailureStage) => {
    // Fixed type/stage pairs bound diagnostics and never retain arbitrary error messages.
    if (!failures.some(row => row.type === type && row.stage === stage)) failures.push({ type, stage });
  };
  const deliveryEnvironment = (type: BrowserVitalsEntryType): BrowserVitalsEntry["environment"] => {
    try {
      const value = environment();
      return {
        visibility: ["visible", "hidden", "prerender"].includes(value.visibility) ? value.visibility : "unknown",
        focused: typeof value.focused === "boolean" ? value.focused : null,
      };
    } catch {
      failure(type, "environment");
      return { visibility: "unknown", focused: null };
    }
  };
  const deliveryTime = (type: BrowserVitalsEntryType) => {
    try { return finite(clock()); } catch { failure(type, "clock"); return null; }
  };
  const install = (): void => {
    if (installed || stopped) return;
    installed = true;
    let supportedTypes: readonly string[] | undefined;
    try { supportedTypes = Observer?.supportedEntryTypes; } catch { for (const type of TYPES) failure(type, "support"); }
    for (const type of TYPES) {
      if (!Observer || supportedTypes && !supportedTypes.includes(type)) {
        status[type] = "unsupported";
        continue;
      }
      let observer: BrowserVitalsObserver;
      try {
        observer = new Observer(list => {
          if (stopped || status[type] !== "observing") return;
          try {
            const at = deliveryTime(type), env = deliveryEnvironment(type);
            for (const entry of list.getEntries()) {
              counts[type] = (counts[type] ?? 0) + 1;
              if (entries.length >= maxEntries) { dropped++; continue; }
              entries.push({
                type, startTime: finite(entry.startTime), duration: finite(entry.duration),
                interactionId: finite(entry.interactionId), processingStart: finite(entry.processingStart),
                processingEnd: finite(entry.processingEnd), value: finite(entry.value),
                hadRecentInput: typeof entry.hadRecentInput === "boolean" ? entry.hadRecentInput : null,
                deliveredAt: at, environment: { ...env },
              });
            }
          } catch { failure(type, "delivery"); }
        });
      } catch {
        status[type] = "failed";
        failure(type, "constructor");
        continue;
      }
      try {
        observer.observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) });
        observers.set(type, observer);
        status[type] = "observing";
        counts[type] = 0;
      } catch {
        status[type] = "failed";
        failure(type, "observe");
        try { observer.disconnect(); } catch { failure(type, "disconnect"); }
      }
    }
  };
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    for (const [type, observer] of observers) {
      try { observer.disconnect(); } catch { failure(type, "disconnect"); }
      status[type] = "stopped";
    }
    observers.clear();
  };
  const collectResources = () => {
    if (!performance?.getEntriesByType) { resourceStatus = "unsupported"; return; }
    try {
      for (const entry of performance.getEntriesByType("resource")) {
        const name = entry.name, url = resourceUrl(name), startTime = finite(entry.startTime);
        // Bounded private identity distinguishes query variants; only redacted URLs are exported.
        const key = JSON.stringify([typeof name === "string" ? name : null, startTime]);
        if (identities.has(key)) continue;
        if (identities.size >= RESOURCE_IDENTITY_CAP) { resourceOverflow = true; break; }
        identities.add(key);
        if (resources.length >= maxResources) { resourceDropped++; continue; }
        resources.push({
          url, startTime, duration: finite(entry.duration),
          initiatorType: typeof entry.initiatorType === "string" ? INITIATORS.has(entry.initiatorType) ? entry.initiatorType : "other" : null,
          transferSize: finite(entry.transferSize), encodedBodySize: finite(entry.encodedBodySize), decodedBodySize: finite(entry.decodedBodySize),
        });
      }
      resourceStatus = resourceOverflow ? "overflow-indeterminate" : "available";
      counts.resource = resourceOverflow ? null : identities.size;
    } catch {
      resourceStatus = "failed";
      counts.resource = null;
      failure("resource", "read");
    }
  };
  const snapshot = (): BrowserVitalsSnapshot => {
    collectResources();
    const resourceAvailable = resourceStatus === "available" || resourceStatus === "overflow-indeterminate";
    return {
      installed, stopped, timeOrigin: finite(performance?.timeOrigin),
      supported: [...TYPES.filter(type => counts[type] !== null), ...(resourceAvailable ? ["resource" as const] : [])],
      unsupported: [...TYPES.filter(type => status[type] === "unsupported"), ...(resourceStatus === "unsupported" ? ["resource" as const] : [])],
      status: { ...status }, entries: entries.map(entry => ({ ...entry, environment: { ...entry.environment } })),
      counts: { ...counts }, dropped, resources: resources.map(entry => ({ ...entry })), resourceStatus,
      resourceDropped: resourceStatus === "available" ? resourceDropped : null,
      resourceDroppedAtLeast: resourceDropped, resourceIdentities: identities.size,
      failures: failures.map(row => ({ ...row })),
      limits: { entries: maxEntries, resources: maxResources, resourceIdentities: RESOURCE_IDENTITY_CAP },
      notes: [
        "Diagnostic entries only; no field INP, presentation timing or performance pass is inferred.",
        "Null means unsupported, missing, failed or indeterminate; zero is retained only when measured or known.",
        "Environment is captured at observer delivery, not reconstructed at entry start.",
        "Resource identity uses source URL plus startTime in a bounded private set; only redacted HTTP(S) origin/pathname is exported.",
        "Resources reflect the available timing buffer only; sizes may be restricted by the browser.",
        "Overflow-indeterminate keeps the first resource cap and a dropped lower bound; exact totals are null.",
        "Install runs once; stop is terminal for observers. Explicit snapshots may still read resource timings.",
      ],
    };
  };
  return { install, stop, snapshot };
}
