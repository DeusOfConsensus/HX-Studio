/**
 * Shell-side (Kern method) — PRELIMINARY correlations for segmentally baffled shells.
 * This is a screening-level method: it ignores bypass/leakage streams and baffle-cut window
 * effects, which the Bell–Delaware method corrects for. Not an industrial rating basis.
 */
import type { TubeArrangement } from "../types";

/** Kern equivalent diameter for shell-side heat transfer / Reynolds number. */
export function kernEquivalentDiameter(pitch: number, dOut: number, arr: TubeArrangement): number {
  if (arr === "square") {
    return (4 * (pitch * pitch - (Math.PI * dOut * dOut) / 4)) / (Math.PI * dOut);
  }
  // triangular: area per tube cell = 0.5 p × 0.866 p, wetted perimeter = 0.5 π do
  return (4 * (0.5 * pitch * 0.866 * pitch - (Math.PI * dOut * dOut) / 8)) / (0.5 * Math.PI * dOut);
}

/** Cross-flow area at shell centreline: As = Ds (p − do) B / p. */
export function kernCrossflowArea(Ds: number, pitch: number, dOut: number, B: number): number {
  return (Ds * (pitch - dOut) * B) / pitch;
}

export interface ShellNu {
  Nu: number;
  correlation: string;
  validity: string;
  inRange: boolean;
  notes: string[];
}

/** Kern: Nu = 0.36 Re^0.55 Pr^(1/3) (mu/mu_w)^0.14, 2×10³ < Re < 1×10⁶. */
export function kernNusselt(Re: number, Pr: number, muRatio = 1): ShellNu {
  return {
    Nu: 0.36 * Math.pow(Re, 0.55) * Math.pow(Pr, 1 / 3) * Math.pow(muRatio, 0.14),
    correlation: "Kern shell-side (segmental baffles, 25 % cut basis)",
    validity: "2×10³ < Re < 1×10⁶",
    inRange: Re > 2e3 && Re < 1e6,
    notes: ["Kern method ignores leakage/bypass streams; Bell–Delaware would typically predict a lower h."],
  };
}

/** Dimensionless Kern friction factor fit, valid 400 < Re < 1×10⁶. */
export function kernFriction(Re: number): number {
  return Math.exp(0.576 - 0.19 * Math.log(Re));
}
