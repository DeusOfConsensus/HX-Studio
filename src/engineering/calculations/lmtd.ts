/** Logarithmic mean temperature difference (8.2) and multipass correction factor. */
import type { FlowArrangement } from "../types";
import { correctionFactor } from "../correlations/effectivenessNtu";

export interface LmtdResult {
  dT1: number;
  dT2: number;
  lmtd: number;
  formula: string;
}

export function terminalDifferences(
  flow: FlowArrangement,
  ThIn: number,
  ThOut: number,
  TcIn: number,
  TcOut: number,
) {
  return flow === "parallel"
    ? { dT1: ThIn - TcIn, dT2: ThOut - TcOut }
    : { dT1: ThIn - TcOut, dT2: ThOut - TcIn };
}

/** LMTD with the limiting value (ΔT1 = ΔT2 → LMTD = ΔT1) handled. Returns null when either ΔT ≤ 0. */
export function lmtd(dT1: number, dT2: number): number | null {
  if (!(dT1 > 0) || !(dT2 > 0)) return null;
  const diff = dT1 - dT2;
  if (Math.abs(diff) < 1e-6 * Math.max(dT1, dT2)) return 0.5 * (dT1 + dT2);
  return diff / Math.log(dT1 / dT2);
}

export function computeLmtd(
  flow: FlowArrangement,
  ThIn: number,
  ThOut: number,
  TcIn: number,
  TcOut: number,
): LmtdResult | null {
  const { dT1, dT2 } = terminalDifferences(flow, ThIn, ThOut, TcIn, TcOut);
  const v = lmtd(dT1, dT2);
  if (v === null) return null;
  return {
    dT1,
    dT2,
    lmtd: v,
    formula:
      flow === "parallel"
        ? "ΔT₁ = Th,in − Tc,in; ΔT₂ = Th,out − Tc,out; LMTD = (ΔT₁ − ΔT₂)/ln(ΔT₁/ΔT₂)"
        : "ΔT₁ = Th,in − Tc,out; ΔT₂ = Th,out − Tc,in; LMTD = (ΔT₁ − ΔT₂)/ln(ΔT₁/ΔT₂)",
  };
}

/**
 * Correction factor F for multipass shell-and-tube from terminal temperatures.
 * F = 1 for true single-pass parallel/counter units (their own LMTD is exact).
 * Multipass: F is referenced to the COUNTERFLOW LMTD.
 */
export function multipassF(
  ThIn: number,
  ThOut: number,
  TcIn: number,
  TcOut: number,
  Ch: number,
  Cc: number,
  shellPasses: number,
): number | null {
  const Q = Ch * (ThIn - ThOut);
  const Cmin = Math.min(Ch, Cc);
  const eps = Q / (Cmin * (ThIn - TcIn));
  const cr = Cmin / Math.max(Ch, Cc);
  void TcOut;
  return correctionFactor(eps, cr, shellPasses);
}
