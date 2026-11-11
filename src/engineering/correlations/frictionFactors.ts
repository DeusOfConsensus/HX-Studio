/** Darcy friction factors for circular conduits. */

export interface FrictionResult {
  f: number;
  regime: "laminar" | "transitional" | "turbulent";
  method: string;
  /** true when value is a flagged interpolation across the transitional band */
  interpolated: boolean;
}

/** Haaland explicit approximation to Colebrook (error < ~2 %); valid 4000 ≤ Re ≤ 1e8, ε/D < 0.05. */
export function haaland(Re: number, relRough: number): number {
  const inv = -1.8 * Math.log10(Math.pow(relRough / 3.7, 1.11) + 6.9 / Re);
  return 1 / (inv * inv);
}

export function darcyFriction(Re: number, relRough: number): FrictionResult {
  if (Re < 2300) return { f: 64 / Re, regime: "laminar", method: "Hagen–Poiseuille f = 64/Re", interpolated: false };
  if (Re > 4000) return { f: haaland(Re, relRough), regime: "turbulent", method: "Haaland (explicit Colebrook)", interpolated: false };
  // Transitional: linear interpolation between laminar @2300 and turbulent @4000 — flagged, not predictive
  const fl = 64 / 2300;
  const ft = haaland(4000, relRough);
  const w = (Re - 2300) / (4000 - 2300);
  return { f: fl + w * (ft - fl), regime: "transitional", method: "Linear blend laminar(2300)→Haaland(4000); indicative only", interpolated: true };
}
