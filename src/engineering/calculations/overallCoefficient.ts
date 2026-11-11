/**
 * Overall heat-transfer coefficient (8.3), thermal resistance network (8.14), fouling (8.12),
 * Prandtl number (8.7). Outside-area basis.
 */
import type { GeometryInput, ManualProps } from "../types";
import { dOut } from "./hydraulics";

export const prandtl = (p: ManualProps) => (p.cp * p.mu) / p.k;

export interface ResistanceNetwork {
  Ai: number;
  Ao: number;
  /** K/W components over the whole exchanger */
  Rconv_i: number;
  Rfoul_i: number;
  Rwall: number;
  Rfoul_o: number;
  Rconv_o: number;
  Rtotal: number;
  /** W/K */
  UAo: number;
  /** W/m²K, based on Ao */
  Uo: number;
  UoClean: number;
  /** area-normalised (m²K/W, outside basis) = Rcomponent × Ao */
  normalised: { conv_i: number; foul_i: number; wall: number; foul_o: number; conv_o: number; total: number };
}

export function areas(g: GeometryInput) {
  const d0 = dOut(g);
  return { Ai: Math.PI * g.di * g.L * g.Nt, Ao: Math.PI * d0 * g.L * g.Nt };
}

/**
 * 1/(Uo Ao) = 1/(hi Ai) + Rfi/Ai + ln(do/di)/(2π kw L Nt) + Rfo/Ao + 1/(ho Ao)
 * h_tube/h_shell are assigned to inside/outside by the caller (depends on which stream is in the tubes).
 */
export function resistanceNetwork(
  g: GeometryInput,
  hInside: number,
  hOutside: number,
  Rfi: number,
  Rfo: number,
): ResistanceNetwork {
  const d0 = dOut(g);
  const { Ai, Ao } = areas(g);
  const Rconv_i = 1 / (hInside * Ai);
  const Rfoul_i = Rfi / Ai;
  const Rwall = Math.log(d0 / g.di) / (2 * Math.PI * g.kw * g.L * g.Nt);
  const Rfoul_o = Rfo / Ao;
  const Rconv_o = 1 / (hOutside * Ao);
  const Rtotal = Rconv_i + Rfoul_i + Rwall + Rfoul_o + Rconv_o;
  const Rclean = Rconv_i + Rwall + Rconv_o;
  return {
    Ai,
    Ao,
    Rconv_i,
    Rfoul_i,
    Rwall,
    Rfoul_o,
    Rconv_o,
    Rtotal,
    UAo: 1 / Rtotal,
    Uo: 1 / (Rtotal * Ao),
    UoClean: 1 / (Rclean * Ao),
    normalised: {
      conv_i: Rconv_i * Ao,
      foul_i: Rfoul_i * Ao,
      wall: Rwall * Ao,
      foul_o: Rfoul_o * Ao,
      conv_o: Rconv_o * Ao,
      total: Rtotal * Ao,
    },
  };
}

/**
 * Effective total fouling resistance (outside basis) from measured/specified clean and dirty
 * coefficients: Rf,total = 1/Ud − 1/Uc. This is a lumped value; it cannot be split between tube
 * and shell sides without additional data, and fouling is NOT predicted from T and flow rate.
 */
export function effectiveFouling(UClean: number, UDirty: number): number | null {
  if (!(UClean > 0) || !(UDirty > 0) || UDirty > UClean) return null;
  return 1 / UDirty - 1 / UClean;
}

/** Total fouling contribution referred to the outside area: Rfi·do/di + Rfo. */
export function totalFoulingOutside(g: GeometryInput, Rfi: number, Rfo: number): number {
  return (Rfi * dOut(g)) / g.di + Rfo;
}
