/**
 * Effectiveness–NTU relations (Kays & London; Incropera Table 11.3/11.4) and their inverses.
 * Cr = Cmin/Cmax in [0, 1].
 */

const EPS = 1e-9;
const isOne = (cr: number) => Math.abs(cr - 1) < EPS;

export function epsParallel(ntu: number, cr: number): number {
  return (1 - Math.exp(-ntu * (1 + cr))) / (1 + cr);
}

export function epsCounter(ntu: number, cr: number): number {
  if (isOne(cr)) return ntu / (1 + ntu);
  const e = Math.exp(-ntu * (1 - cr));
  return (1 - e) / (1 - cr * e);
}

/** One shell pass, 2, 4, 6... tube passes. */
export function epsShell1(ntu: number, cr: number): number {
  const s = Math.sqrt(1 + cr * cr);
  const e = Math.exp(-ntu * s);
  return 2 / (1 + cr + (s * (1 + e)) / (1 - e));
}

/** N shell passes in series, each with 2,4,... tube passes, total NTU split equally. */
export function epsShellN(ntu: number, cr: number, n: number): number {
  const e1 = epsShell1(ntu / n, cr);
  if (n === 1) return e1;
  if (isOne(cr)) return (n * e1) / (1 + (n - 1) * e1);
  const g = Math.pow((1 - e1 * cr) / (1 - e1), n);
  return (g - 1) / (g - cr);
}

/** Maximum effectiveness reachable (NTU → ∞) for each arrangement. */
export function epsMax(kind: "parallel" | "counter" | "shell", cr: number): number {
  if (kind === "parallel") return 1 / (1 + cr);
  if (kind === "counter") return 1;
  return 2 / (1 + cr + Math.sqrt(1 + cr * cr)); // single-shell asymptote; N-shell is higher
}

// ---------------------------------------------------------------- inverses (NTU from ε)

export function ntuParallel(eps: number, cr: number): number | null {
  const x = 1 - eps * (1 + cr);
  if (x <= 0 || eps < 0) return null;
  return -Math.log(x) / (1 + cr);
}

export function ntuCounter(eps: number, cr: number): number | null {
  if (eps < 0 || eps >= 1) return null;
  if (isOne(cr)) return eps / (1 - eps);
  const num = eps - 1;
  const den = eps * cr - 1;
  const r = num / den;
  if (r <= 0) return null;
  return Math.log(r) / (cr - 1);
}

export function ntuShell1(eps: number, cr: number): number | null {
  if (eps <= 0) return eps === 0 ? 0 : null;
  const s = Math.sqrt(1 + cr * cr);
  const E = (2 / eps - (1 + cr)) / s;
  if (E <= 1) return null; // beyond the single-shell asymptote
  return -Math.log((E - 1) / (E + 1)) / s;
}

export function ntuShellN(eps: number, cr: number, n: number): number | null {
  if (n === 1) return ntuShell1(eps, cr);
  // Invert the N-shell composition to get the per-shell effectiveness
  let e1: number;
  if (isOne(cr)) {
    e1 = eps / (n - (n - 1) * eps);
  } else {
    const f = Math.pow((eps * cr - 1) / (eps - 1), 1 / n);
    e1 = (f - 1) / (f - cr);
  }
  const ntu1 = ntuShell1(e1, cr);
  return ntu1 === null ? null : n * ntu1;
}

/**
 * Correction factor F = NTU_counterflow(ε) / NTU_actual(ε), i.e. the ratio of the area a pure
 * counterflow unit would need to that the actual configuration needs. Exact for the 1–2n shell
 * arrangement (equals the Bowman closed form), derived here through ε–NTU so it also holds for
 * N shell passes. Returns null when ε is thermodynamically unreachable for the configuration.
 */
export function correctionFactor(eps: number, cr: number, shellPasses: number): number | null {
  const ntuCF = ntuCounter(eps, cr);
  const ntuAct = ntuShellN(eps, cr, shellPasses);
  if (ntuCF === null || ntuAct === null || ntuAct <= 0) return null;
  return ntuCF / ntuAct;
}

/** Bowman closed-form F for 1 shell pass, even tube passes (independent cross-check). */
export function bowmanF1(R: number, P: number): number | null {
  if (P <= 0 || P >= 1) return null;
  if (Math.abs(R - 1) < 1e-9) {
    const s = Math.SQRT2;
    const arg = (2 - P * (2 - s)) / (2 - P * (2 + s));
    if (arg <= 0) return null;
    return ((s * P) / (1 - P)) / Math.log(arg);
  }
  const s = Math.sqrt(R * R + 1);
  const a = (1 - P) / (1 - R * P);
  const b = (2 / P - 1 - R + s) / (2 / P - 1 - R - s);
  if (a <= 0 || b <= 0) return null;
  return ((s / (R - 1)) * Math.log(a)) / Math.log(b);
}
