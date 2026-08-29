/** Minimal Wake Lock API declarations for browsers whose DOM types omit it. */
export interface WakeLockSentinelLike extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}
export interface WakeLockNavigatorLike {
  wakeLock?: {
    request(type: "screen"): Promise<WakeLockSentinelLike>;
  };
}

export type WakeLockStatus =
  | "unsupported"
  | "idle"
  | "requesting"
  | "active"
  | "released"
  | "error";

export interface WakeLockResult {
  supported: boolean;
  status: WakeLockStatus;
  error: string | null;
  request: () => Promise<boolean>;
  release: () => Promise<void>;
}
