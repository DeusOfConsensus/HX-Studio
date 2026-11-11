/**
 * Internal-flow Nusselt correlations. Each returns the value plus the validity check performed,
 * so the UI can show "selected correlation / validity range / inputs / result".
 */
import type { CorrelationChoice } from "../types";

export interface NuResult {
  Nu: number;
  correlation: string;
  validity: string;
  inRange: boolean;
  /** Notes such as interpolation or property-ratio assumptions. */
  notes: string[];
  regime: "laminar" | "transitional" | "turbulent";
}

export interface NuInputs {
  Re: number;
  Pr: number;
  /** diameter / flow length, used for developing-flow terms */
  DoverL: number;
  /** true when the fluid is being heated (n = 0.4) else cooled (n = 0.3) — Dittus–Boelter */
  heating: boolean;
  /** mu_bulk / mu_wall; defaults to 1 when wall temperature is not resolved */
  viscosityRatio?: number;
}

export function gnielinskiFriction(Re: number): number {
  return Math.pow(0.79 * Math.log(Re) - 1.64, -2);
}

export function gnielinski(Re: number, Pr: number): number {
  const f = gnielinskiFriction(Re);
  const f8 = f / 8;
  return (f8 * (Re - 1000) * Pr) / (1 + 12.7 * Math.sqrt(f8) * (Math.pow(Pr, 2 / 3) - 1));
}

export function dittusBoelter(Re: number, Pr: number, heating: boolean): number {
  return 0.023 * Math.pow(Re, 0.8) * Math.pow(Pr, heating ? 0.4 : 0.3);
}

export function siederTate(Re: number, Pr: number, muRatio: number): number {
  return 0.027 * Math.pow(Re, 0.8) * Math.pow(Pr, 1 / 3) * Math.pow(muRatio, 0.14);
}

/** Hausen thermally-developing laminar flow, constant wall temperature (Incropera Eq. 8.57). */
export function hausenLaminar(Re: number, Pr: number, DoverL: number): number {
  const Gz = DoverL * Re * Pr;
  return 3.66 + (0.0668 * Gz) / (1 + 0.04 * Math.pow(Gz, 2 / 3));
}

export function nusseltInternal(choice: CorrelationChoice, x: NuInputs): NuResult {
  const { Re, Pr, DoverL, heating } = x;
  const mr = x.viscosityRatio ?? 1;
  const notes: string[] = [];
  if (x.viscosityRatio === undefined) notes.push("Wall-viscosity correction taken as 1 (wall temperature not resolved).");

  // ---- explicit user selection: apply it and report validity honestly
  if (choice === "dittus-boelter") {
    const ok = Re >= 1e4 && Pr >= 0.6 && Pr <= 160 && 1 / DoverL >= 10;
    return {
      Nu: dittusBoelter(Re, Pr, heating),
      correlation: `Dittus–Boelter (n = ${heating ? "0.4" : "0.3"})`,
      validity: "Re ≥ 10 000, 0.6 ≤ Pr ≤ 160, L/D ≥ 10, moderate property variation",
      inRange: ok,
      notes,
      regime: Re < 2300 ? "laminar" : Re < 1e4 ? "transitional" : "turbulent",
    };
  }
  if (choice === "sieder-tate") {
    const ok = Re >= 1e4 && Pr >= 0.7 && Pr <= 16700;
    return {
      Nu: siederTate(Re, Pr, mr),
      correlation: "Sieder–Tate",
      validity: "Re ≥ 10 000, 0.7 ≤ Pr ≤ 16 700, L/D ≥ 10",
      inRange: ok,
      notes,
      regime: Re < 2300 ? "laminar" : Re < 1e4 ? "transitional" : "turbulent",
    };
  }
  if (choice === "gnielinski") {
    const ok = Re >= 3000 && Re <= 5e6 && Pr >= 0.5 && Pr <= 2000;
    return {
      Nu: gnielinski(Re, Pr),
      correlation: "Gnielinski",
      validity: "3000 ≤ Re ≤ 5×10⁶, 0.5 ≤ Pr ≤ 2000",
      inRange: ok,
      notes,
      regime: Re < 2300 ? "laminar" : Re < 3000 ? "transitional" : "turbulent",
    };
  }

  // ---- auto selection by regime
  if (Re < 2300) {
    return {
      Nu: hausenLaminar(Re, Pr, DoverL),
      correlation: "Hausen (laminar, thermally developing, constant wall T)",
      validity: "Re < 2300, laminar; Nu → 3.66 as L/D → ∞",
      inRange: true,
      notes,
      regime: "laminar",
    };
  }
  if (Re < 3000) {
    const lam = hausenLaminar(2300, Pr, DoverL);
    const tur = gnielinski(3000, Pr);
    const w = (Re - 2300) / 700;
    return {
      Nu: lam + w * (tur - lam),
      correlation: "Linear blend: Hausen(Re=2300) → Gnielinski(Re=3000)",
      validity: "2300 ≤ Re < 3000 is the transitional band; value is indicative only",
      inRange: false,
      notes: [...notes, "Transitional flow: no reliable correlation exists; treat result as an estimate."],
      regime: "transitional",
    };
  }
  const inRange = Re <= 5e6 && Pr >= 0.5 && Pr <= 2000;
  return {
    Nu: gnielinski(Re, Pr),
    correlation: "Gnielinski",
    validity: "3000 ≤ Re ≤ 5×10⁶, 0.5 ≤ Pr ≤ 2000",
    inRange,
    notes,
    regime: "turbulent",
  };
}
