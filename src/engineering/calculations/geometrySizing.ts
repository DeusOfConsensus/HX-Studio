/**
 * Tube geometry relations (8.15). do = di + 2t; Ao = π do L Nt.
 * Closed-form single-variable sizing for a given required outside area; the iterative
 * design-mode solver (which re-evaluates U for every trial) lives in simulation/solvers/sizing.ts.
 */

export const outsideDiameter = (di: number, t: number) => di + 2 * t;
export const outsideArea = (dOutside: number, L: number, Nt: number) => Math.PI * dOutside * L * Nt;
export const insideArea = (di: number, L: number, Nt: number) => Math.PI * di * L * Nt;

export type SizingVariable = "L" | "Nt" | "di";

export function lengthForArea(Areq: number, dOutside: number, Nt: number): number | null {
  const d = Math.PI * dOutside * Nt;
  return d > 0 && Areq > 0 ? Areq / d : null;
}

/** Fractional tube count; caller must round UP to an integer. */
export function tubeCountForArea(Areq: number, dOutside: number, L: number): number | null {
  const d = Math.PI * dOutside * L;
  return d > 0 && Areq > 0 ? Areq / d : null;
}

export function outsideDiameterForArea(Areq: number, L: number, Nt: number): number | null {
  const d = Math.PI * L * Nt;
  return d > 0 && Areq > 0 ? Areq / d : null;
}
