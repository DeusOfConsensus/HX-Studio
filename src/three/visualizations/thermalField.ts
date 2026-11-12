/**
 * Maps the solver's numerical bulk temperature profile onto streams in physical space.
 * No temperature is invented here: every value is an interpolation of `TemperatureProfile`.
 * Colours are a DISCRETE solid-colour palette (no gradients).
 */
import type { StreamId } from "../../engineering/types";
import type { TemperatureProfile } from "../../simulation/temperatureProfiles/profile";

/** Temperature of a stream after fraction s ∈ [0,1] of its flow path (s = 0 at its inlet). */
export function streamTemperature(profile: TemperatureProfile, stream: StreamId, s: number): number {
  const sc = Math.min(1, Math.max(0, s));
  // Profile ξ runs along the HOT stream. Cold shares ξ in parallel flow and runs against it in counterflow.
  const xi = stream === "hot" ? sc : profile.arrangement === "parallel" ? sc : 1 - sc;
  const arr = stream === "hot" ? profile.Th : profile.Tc;
  const n = arr.length - 1;
  const p = xi * n;
  const i = Math.min(n - 1, Math.floor(p));
  const f = p - i;
  return arr[i] + f * (arr[i + 1] - arr[i]);
}

/** 12 solid steps, cool → warm. */
export const THERMAL_PALETTE = [
  "#0B6E8A", "#008C99", "#00A6A6", "#3FB5A0", "#7FC08A", "#B8C46F",
  "#E0BE55", "#E6A23C", "#E58934", "#E26F3A", "#DD5A3F", "#D9534F",
] as const;

export function thermalBin(T: number, Tmin: number, Tmax: number): number {
  const span = Tmax - Tmin;
  if (!(span > 0)) return 0;
  const f = (T - Tmin) / span;
  return Math.min(THERMAL_PALETTE.length - 1, Math.max(0, Math.floor(f * THERMAL_PALETTE.length)));
}

export const thermalColor = (T: number, Tmin: number, Tmax: number) => THERMAL_PALETTE[thermalBin(T, Tmin, Tmax)];

export const STREAM_COLORS = { hot: "#E6A23C", cold: "#00A6A6" } as const;
