/**
 * Design-mode sizing: solve ONE chosen geometry variable (L, Nt or di) so that available area
 * equals required area, with every other dimension fixed. U and ΔP are re-evaluated at each trial
 * (h depends on velocity, which depends on Nt and di), so this is a bisection on the full model.
 *
 * Only duty mode (both outlet temperatures specified) is a well-posed sizing problem; otherwise the
 * problem is underdetermined and an explicit error is returned instead of guessing.
 */
import type { ExchangerInput, GeometryInput } from "../../engineering/types";
import type { SizingVariable } from "../../engineering/calculations/geometrySizing";
import { evaluate } from "./exchangerSolver";

export interface SizingResult {
  status: "solved" | "underdetermined" | "no_bracket" | "invalid";
  variable: SizingVariable;
  value: number | null;
  message: string;
  fixed: string[];
  unknown: string;
  areaRequired: number | null;
  areaAvailable: number | null;
}

const BOUNDS: Record<SizingVariable, [number, number]> = {
  L: [0.1, 60],
  Nt: [2, 20000],
  di: [0.004, 0.2],
};

function withVar(input: ExchangerInput, v: SizingVariable, x: number): ExchangerInput {
  const g: GeometryInput = { ...input.geometry };
  if (v === "L") g.L = x;
  if (v === "Nt") g.Nt = Math.max(1, Math.round(x));
  if (v === "di") g.di = x;
  return { ...input, geometry: g };
}

/** margin(x) = available − required (m²); null if the trial point cannot be evaluated. */
function margin(input: ExchangerInput, v: SizingVariable, x: number) {
  const e = evaluate(withVar(input, v, x));
  if (!e.state || e.state.areaRequired === null) return null;
  return { m: e.state.net.Ao - e.state.areaRequired, req: e.state.areaRequired, avail: e.state.net.Ao };
}

export function solveSizing(input: ExchangerInput, variable: SizingVariable): SizingResult {
  const fixedAll = ["di", "t", "L", "Nt", "pitch", "Ds", "tubePasses", "shellPasses", "baffleSpacing"].filter(
    (k) => !(k === variable),
  );
  const base = { variable, fixed: fixedAll, unknown: variable };
  if (input.mode !== "duty") {
    return { ...base, status: "underdetermined", value: null, areaRequired: null, areaAvailable: null,
      message: "Design sizing requires duty mode: specify both outlet temperatures (and flows) so the duty is fixed, then choose the one dimension to solve." };
  }
  const [lo, hi] = BOUNDS[variable];
  const fl = margin(input, variable, lo);
  const fh = margin(input, variable, hi);
  if (!fl || !fh) {
    return { ...base, status: "invalid", value: null, areaRequired: null, areaAvailable: null,
      message: "The model cannot be evaluated at the search bounds (check inputs and warnings)." };
  }
  if (fl.m * fh.m > 0) {
    return { ...base, status: "no_bracket", value: null, areaRequired: fl.req, areaAvailable: fl.avail,
      message: `No solution for ${variable} within [${lo}, ${hi}] with the other dimensions fixed (area margin does not change sign).` };
  }
  let a = lo;
  let b = hi;
  let fa = fl.m;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (a + b);
    const fm = margin(input, variable, mid);
    if (!fm) break;
    if (fm.m * fa <= 0) b = mid;
    else {
      a = mid;
      fa = fm.m;
    }
    if (Math.abs(b - a) < 1e-9 * Math.max(1, Math.abs(b))) break;
  }
  let x = 0.5 * (a + b);
  // choose the smaller feasible side (adequate area) and round Nt up to a whole tube
  if (variable === "Nt") {
    x = Math.ceil(b);
    let m = margin(input, "Nt", x);
    while (m && m.m < 0 && x < BOUNDS.Nt[1]) {
      x += 1;
      m = margin(input, "Nt", x);
    }
  } else {
    x = b;
  }
  const fin = margin(input, variable, x);
  return {
    ...base,
    status: "solved",
    value: x,
    areaRequired: fin?.req ?? null,
    areaAvailable: fin?.avail ?? null,
    message: `Solved ${variable} = ${variable === "Nt" ? x : x.toPrecision(5)} with all other dimensions fixed; U re-evaluated at every trial.`,
  };
}
