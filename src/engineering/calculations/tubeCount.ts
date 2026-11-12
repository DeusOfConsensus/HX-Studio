/**
 * Tube-lattice capacity: how many tubes of a given pitch/arrangement physically fit in a shell.
 * Shared by validation (engineering layer) and the 3D scene so geometry and calculation agree.
 *
 * This is a geometric lattice count (tubes closest to the axis first, one fixed lattice
 * orientation). It does not model TEMA pass-partition lanes, tie rods or sealing strips, so real
 * tube counts for multipass units are usually lower (Kern/TEMA tube-count tables).
 */
import type { TubeArrangement } from "../types";

/** Radial clearance between the outermost tube surface and the shell wall (m). */
export const shellClearance = (_Ds: number) => 0.005;

export interface LatticePoint {
  y: number;
  z: number;
  r: number;
}

export function latticePositions(pitch: number, arrangement: TubeArrangement, Ds: number, dOut: number): LatticePoint[] {
  const Rb = Ds / 2 - dOut / 2 - shellClearance(Ds);
  const out: LatticePoint[] = [];
  if (!(Rb > 0) || !(pitch > 0)) return out;
  const rowSp = arrangement === "triangular" ? pitch * 0.8660254037844386 : pitch;
  const nRows = Math.ceil(Rb / rowSp) + 1;
  const nCols = Math.ceil(Rb / pitch) + 1;
  for (let j = -nRows; j <= nRows; j++) {
    const y = j * rowSp;
    const off = arrangement === "triangular" && Math.abs(j) % 2 === 1 ? pitch / 2 : 0;
    for (let i = -nCols; i <= nCols; i++) {
      const z = off + i * pitch;
      const r = Math.hypot(y, z);
      if (r <= Rb + 1e-9) out.push({ y, z, r });
    }
  }
  // closest to the axis first; deterministic tie-break
  out.sort((a, b) => a.r - b.r || a.y - b.y || a.z - b.z);
  return out;
}

export const tubeCapacity = (pitch: number, arrangement: TubeArrangement, Ds: number, dOut: number) =>
  latticePositions(pitch, arrangement, Ds, dOut).length;
