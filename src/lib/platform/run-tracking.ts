/** Browser position acquisition or the deterministic demo simulator. */
export type RunTrackingMode = "live" | "demo";

/** Named demo speed profiles. `still` deliberately reports no movement. */
export type DemoPace = "still" | "easy" | "sprint";

/** Scriptable judge result exposed by the demo without story-layer coupling. */
export type DemoOutcome = "success" | "miss";

/** GPS conditions that can be rehearsed in demo mode. */
export type DemoGpsCondition = "available" | "unavailable" | "noisy";

export type RunPhase =
  | "idle"
  | "calibrating"
  | "running"
  | "paused"
  | "stopped";

export type GpsStatus =
  | "idle"
  | "requesting"
  | "calibrating"
  | "ready"
  | "denied"
  | "unavailable"
  | "noisy"
  | "error";

export type CalibrationStatus =
  | "idle"
  | "collecting"
  | "ready"
  | "degraded"
  | "unavailable";

export interface RunCalibration {
  status: CalibrationStatus;
  /** Number of usable readings collected for the initial GPS baseline. */
  sampleCount: number;
  /** Progress toward the normal three-reading baseline, from 0 to 1. */
  progress: number;
  /** Best accuracy observed while establishing the baseline. */
  accuracyMeters: number | null;
}
export interface RunMetrics {
  phase: RunPhase;
  gpsStatus: GpsStatus;
  calibration: RunCalibration;
  /** Total filtered route length. Raw coordinates are never exposed. */
  distanceMeters: number;
  elapsedMs: number;
  speedMps: number;
  /** Minutes-per-kilometre expressed as seconds. Null while stationary. */
  paceSecondsPerKm: number | null;
  accuracyMeters: number | null;
}

export interface RunTrackingOptions {
  mode: RunTrackingMode;
  demoPace?: DemoPace;
  demoOutcome?: DemoOutcome;
  demoGps?: DemoGpsCondition;
  /** Accelerates deterministic demo time. Clamped to 1-20. */
  demoTimeScale?: number;
  /** Accuracy above this value is treated as noisy and is not accumulated. */
  maxAccuracyMeters?: number;
}

export interface DemoDescriptor {
  label: string;
  pace: DemoPace;
  outcome: DemoOutcome;
  gps: DemoGpsCondition;
  timeScale: number;
}

export interface RunTrackingResult extends RunMetrics {
  source: "gps" | "demo";
  demo: DemoDescriptor | null;
  error: string | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

export interface CoordinateSample {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** Great-circle distance for internal, in-memory coordinate processing. */
export function distanceBetween(
  first: CoordinateSample,
  second: CoordinateSample,
): number {
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function paceFromSpeed(speedMps: number): number | null {
  return speedMps > 0.15 ? 1_000 / speedMps : null;
}

export const DEMO_SPEED_METERS_PER_SECOND: Record<DemoPace, number> = {
  still: 0,
  easy: 2.55,
  sprint: 5.8,
};

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
