/**
 * Velocity (8.9), Reynolds number (8.5), pressure drop (8.8) and pumping power (8.13).
 * Pure functions, SI units.
 */
import type { GeometryInput } from "../types";
import type { ManualProps } from "../types";
import { darcyFriction } from "../correlations/frictionFactors";
import { kernCrossflowArea, kernEquivalentDiameter, kernFriction } from "../correlations/shellSide";

export interface SideHydraulics {
  side: "tube" | "shell";
  /** Hydraulic / equivalent diameter used for Re and Nu (m) */
  Dh: number;
  flowArea: number; // m²
  velocity: number; // m/s
  massFlux: number; // kg/m²s
  Qv: number; // m³/s
  Re: number;
  regime: "laminar" | "transitional" | "turbulent";
  dP: number; // Pa
  frictionFactor: number;
  frictionMethod: string;
  dPBreakdown: Record<string, number>;
  notes: string[];
  rePctValid: boolean; // Reynolds within the validity range of the dP method
}

export const dOut = (g: GeometryInput) => g.di + 2 * g.t;

export function regimeOf(Re: number): "laminar" | "transitional" | "turbulent" {
  return Re < 2300 ? "laminar" : Re <= 4000 ? "transitional" : "turbulent";
}

/** Tubes carrying flow in parallel within one pass. */
export const tubesPerPass = (g: GeometryInput) => g.Nt / g.tubePasses;

export function tubeSideHydraulics(g: GeometryInput, mdot: number, p: ManualProps): SideHydraulics {
  const Np = g.type === "double-pipe" ? 1 : g.tubePasses;
  const n = g.type === "double-pipe" ? 1 : g.Nt / Np;
  const A = n * (Math.PI / 4) * g.di * g.di;
  const Qv = mdot / p.rho;
  const v = Qv / A;
  const Re = (p.rho * v * g.di) / p.mu;
  const fr = darcyFriction(Re, g.roughness / g.di);
  const straight = Np * fr.f * (g.L / g.di) * (p.rho * v * v) / 2;
  // Sinnott: 2.5 velocity heads per pass (entrance, exit, return); double-pipe: 1.5 (0.5 in + 1.0 out)
  const K = g.type === "double-pipe" ? 1.5 : 2.5 * Np;
  const minor = K * (p.rho * v * v) / 2;
  const notes: string[] = [fr.method];
  if (fr.interpolated) notes.push("Transitional flow: friction factor is a flagged interpolation.");
  return {
    side: "tube",
    Dh: g.di,
    flowArea: A,
    velocity: v,
    massFlux: mdot / A,
    Qv,
    Re,
    regime: fr.regime,
    dP: straight + minor,
    frictionFactor: fr.f,
    frictionMethod: fr.method,
    dPBreakdown: { straight, minor },
    notes: [
      ...notes,
      g.type === "double-pipe"
        ? "Minor losses: K = 1.5 velocity heads (entrance 0.5 + exit 1.0)."
        : "Minor losses: 2.5 velocity heads per pass (entrance, exit, return; Sinnott). Nozzle losses not included.",
    ],
    rePctValid: true,
  };
}

export function shellSideHydraulics(g: GeometryInput, mdot: number, p: ManualProps): SideHydraulics {
  const Qv = mdot / p.rho;
  if (g.type === "double-pipe") {
    const d0 = dOut(g);
    const A = (Math.PI / 4) * (g.Ds * g.Ds - d0 * d0);
    const Dh = g.Ds - d0;
    const v = Qv / A;
    const Re = (p.rho * v * Dh) / p.mu;
    const fr = darcyFriction(Re, g.roughness / Dh);
    const straight = fr.f * (g.L / Dh) * (p.rho * v * v) / 2;
    const minor = 1.5 * (p.rho * v * v) / 2;
    return {
      side: "shell",
      Dh,
      flowArea: A,
      velocity: v,
      massFlux: mdot / A,
      Qv,
      Re,
      regime: fr.regime,
      dP: straight + minor,
      frictionFactor: fr.f,
      frictionMethod: fr.method,
      dPBreakdown: { straight, minor },
      notes: [
        "Annulus modelled with hydraulic diameter Dh = D₂ − D₁ for Re, f and Nu (approximation; heat-transfer equivalent diameter would differ).",
        "Minor losses: K = 1.5 velocity heads.",
        fr.method,
      ],
      rePctValid: true,
    };
  }
  // Shell-and-tube: Kern
  const d0 = dOut(g);
  const de = kernEquivalentDiameter(g.pitch, d0, g.arrangement);
  const As = kernCrossflowArea(g.Ds, g.pitch, d0, g.baffleSpacing);
  const Gs = mdot / As;
  const v = Gs / p.rho;
  const Re = (Gs * de) / p.mu;
  const nBaffles = Math.max(0, Math.ceil(g.L / g.baffleSpacing) - 1);
  const f = kernFriction(Re);
  // Shell passes act in series: each pass sees the full flow, so dP scales with the number of shell passes
  const dP = g.shellPasses * f * (Gs * Gs) / (2 * p.rho) * (g.Ds / de) * (nBaffles + 1);
  const valid = Re > 400 && Re < 1e6;
  return {
    side: "shell",
    Dh: de,
    flowArea: As,
    velocity: v,
    massFlux: Gs,
    Qv,
    Re,
    regime: regimeOf(Re),
    dP,
    frictionFactor: f,
    frictionMethod: "Kern f = exp(0.576 − 0.19 ln Re), 400 < Re < 10⁶",
    dPBreakdown: { crossflow: dP },
    notes: [
      "Kern preliminary method: ΔP = Ns·f·Gs²/(2ρ)·(Ds/de)·(Nb+1). Nozzle, window and bypass losses are not included; not an industrial prediction.",
      `Number of baffles Nb = ${nBaffles}.`,
      ...(valid ? [] : ["Reynolds number outside the Kern friction-factor fit range."]),
    ],
    rePctValid: valid,
  };
}

/** Hydraulic and electrical pumping power (8.13). */
export function pumpingPower(dP: number, Qv: number, eff: number) {
  const hydraulic = dP * Qv;
  return { hydraulic, electrical: hydraulic / eff };
}
