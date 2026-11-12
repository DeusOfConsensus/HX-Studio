/**
 * Pure (three.js-free) geometry layout. The 3D scene renders exactly what this module returns, and
 * the same module defines the flow plan (which end each stream enters), so geometry, animation and
 * calculation cannot drift apart.
 *
 * Coordinates: x along the exchanger axis, 0 = front tubesheet, L = rear tubesheet. y up, z toward viewer.
 */
import type { ExchangerInput, GeometryInput, StreamId, TubeArrangement } from "../../engineering/types";
import { latticePositions, shellClearance } from "../../engineering/calculations/tubeCount";

export { shellClearance };
export const MAX_RENDERED_TUBES = 600;

const dOutOf = (g: GeometryInput) => g.di + 2 * g.t;

export interface TubePos {
  index: number;
  y: number;
  z: number;
  pass: number;
}

export interface TubeLayout {
  tubes: TubePos[];
  /** Tubes the calculation uses (Nt) */
  requested: number;
  /** Tubes drawn (capped for performance) */
  rendered: number;
  /** Lattice positions available inside the shell at this pitch */
  capacity: number;
  fitsShell: boolean;
  capped: boolean;
  bundleRadius: number;
  /** y of partition plates between pass bands: boundaries[k] separates band k and k+1 */
  passBoundaries: number[];
}

export function tubeLayout(g: GeometryInput): TubeLayout {
  const d0 = dOutOf(g);
  if (g.type === "double-pipe") {
    return {
      tubes: [{ index: 0, y: 0, z: 0, pass: 0 }],
      requested: 1,
      rendered: 1,
      capacity: 1,
      fitsShell: true,
      capped: false,
      bundleRadius: d0 / 2,
      passBoundaries: [],
    };
  }
  const Rs = g.Ds / 2;
  const Rb = Rs - d0 / 2 - shellClearance(g.Ds);
  const cand = latticePositions(g.pitch, g.arrangement, g.Ds, d0);
  const capacity = cand.length;
  const nDraw = Math.min(g.Nt, capacity, MAX_RENDERED_TUBES);
  const chosen = cand.slice(0, nDraw);
  // pass bands by y quantile (band 0 at the bottom)
  const order = chosen.map((c, i) => ({ ...c, i })).sort((a, b) => a.y - b.y || a.z - b.z);
  const passes = Math.max(1, g.tubePasses);
  const tubes: TubePos[] = new Array(nDraw);
  order.forEach((c, rank) => {
    tubes[c.i] = { index: c.i, y: c.y, z: c.z, pass: Math.min(passes - 1, Math.floor((rank * passes) / nDraw)) };
  });
  const passBoundaries: number[] = [];
  for (let k = 0; k < passes - 1; k++) {
    const below = Math.max(...tubes.filter((t) => t.pass === k).map((t) => t.y));
    const above = Math.min(...tubes.filter((t) => t.pass === k + 1).map((t) => t.y));
    passBoundaries.push((below + above) / 2);
  }
  return {
    tubes,
    requested: g.Nt,
    rendered: nDraw,
    capacity,
    fitsShell: capacity >= g.Nt,
    capped: g.Nt > nDraw && capacity >= g.Nt,
    bundleRadius: Rb,
    passBoundaries,
  };
}

/** Baffle axial stations: Nb = ceil(L/B) − 1 at multiples of B — identical to the solver's Nb. */
export function baffleStations(g: GeometryInput): number[] {
  if (g.type === "double-pipe") return [];
  const nb = Math.max(0, Math.ceil(g.L / g.baffleSpacing) - 1);
  return Array.from({ length: nb }, (_, i) => (i + 1) * g.baffleSpacing);
}

export interface FlowPlan {
  tubeStream: StreamId;
  shellStream: StreamId;
  multipass: boolean;
  passes: number;
  /** x-direction of shell/annulus flow */
  shellDir: 1 | -1;
  shellInletX: number;
  shellOutletX: number;
  /** x of tube inlet / outlet (outlet at front for even pass counts) */
  tubeInletX: number;
  tubeOutletX: number;
  /** Single-pass tube direction is +1; multipass alternates by pass */
  tubePassDir: (pass: number) => 1 | -1;
  /** Explanatory label for the UI */
  description: string;
}

export function flowPlan(g: GeometryInput): FlowPlan {
  const tubeStream: StreamId = g.tubeSideStream;
  const shellStream: StreamId = tubeStream === "hot" ? "cold" : "hot";
  const passes = g.type === "double-pipe" ? 1 : Math.max(1, g.tubePasses);
  const multipass = g.type === "shell-and-tube" && passes > 1;
  let shellDir: 1 | -1;
  let description: string;
  if (multipass) {
    // Matches the solver: multipass shell-and-tube is rated as overall counter-current with factor F.
    shellDir = -1;
    description = `${g.shellPasses} shell / ${passes} tube passes — overall counter-current, F-corrected (arrangement selector not applicable)`;
  } else if (g.flow === "parallel") {
    shellDir = 1;
    description = "Parallel flow — both streams enter at the front end and move in the same direction";
  } else {
    shellDir = -1;
    description = "Counter-current flow — streams enter at opposite ends and move in opposite directions";
  }
  const tubeOutletX = passes % 2 === 0 ? 0 : g.L;
  return {
    tubeStream,
    shellStream,
    multipass,
    passes,
    shellDir,
    shellInletX: shellDir === 1 ? 0 : g.L,
    shellOutletX: shellDir === 1 ? g.L : 0,
    tubeInletX: 0,
    tubeOutletX,
    tubePassDir: (p: number) => (p % 2 === 0 ? 1 : -1),
    description,
  };
}

/** Progress s ∈ [0,1] of the shell/annulus stream at axial position x. */
export function shellProgress(plan: FlowPlan, L: number, x: number): number {
  const f = Math.min(1, Math.max(0, x / L));
  return plan.shellDir === 1 ? f : 1 - f;
}

/** Progress s ∈ [0,1] of the tube stream in pass `pass` after fraction f of that pass. */
export function tubeProgress(plan: FlowPlan, pass: number, f: number): number {
  return (pass + Math.min(1, Math.max(0, f))) / plan.passes;
}

/** Deterministic PRNG so particle layouts are reproducible between renders. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lateral (y,z) positions in the shell that do not intersect any rendered tube. */
export function shellFreePositions(g: GeometryInput, layout: TubeLayout, n: number, seed = 7): Array<[number, number]> {
  const d0 = dOutOf(g);
  const rnd = mulberry32(seed);
  const out: Array<[number, number]> = [];
  const Rs = g.Ds / 2;
  let guard = 0;
  while (out.length < n && guard++ < n * 200) {
    const r = Math.sqrt(rnd()) * (Rs * 0.94);
    const a = rnd() * Math.PI * 2;
    const y = r * Math.sin(a);
    const z = r * Math.cos(a);
    if (g.type === "double-pipe") {
      if (r < d0 / 2 + 0.003) continue;
    } else if (layout.tubes.some((t) => Math.hypot(t.y - y, t.z - z) < d0 / 2 + 0.002)) continue;
    out.push([y, z]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Positional API (used by src/tests/validation/layout.test.ts)
// ---------------------------------------------------------------------------------------------

export interface TubeLayoutResult {
  /** [y, z] per drawn tube */
  positions: Array<[number, number]>;
  /** pass index per drawn tube (parallel to `positions`) */
  passIndex: number[];
  placed: number;
  capacity: number;
  fits: boolean;
}

export function layoutTubes(
  nTubes: number,
  pitch: number,
  arrangement: TubeArrangement,
  Ds: number,
  dOut: number,
  passes = 1,
): TubeLayoutResult {
  const cand = latticePositions(pitch, arrangement, Ds, dOut);
  const placed = Math.min(nTubes, cand.length);
  const chosen = cand.slice(0, placed);
  const order = chosen.map((c, i) => ({ ...c, i })).sort((a, b) => a.y - b.y || a.z - b.z);
  const passIndex = new Array<number>(placed).fill(0);
  const p = Math.max(1, passes);
  order.forEach((c, rank) => {
    passIndex[c.i] = Math.min(p - 1, Math.floor((rank * p) / Math.max(1, placed)));
  });
  return {
    positions: chosen.map((c) => [c.y, c.z] as [number, number]),
    passIndex,
    placed,
    capacity: cand.length,
    fits: cand.length >= nTubes,
  };
}

/** Number of baffles: Nb = ceil(L/B) − 1 (same expression as the Kern shell-side model). */
export const baffleCount = (L: number, B: number) => Math.max(0, Math.ceil(L / B) - 1);

/** Baffle x positions in CENTRED coordinates (x ∈ [−L/2, L/2]). */
export function baffleXs(g: GeometryInput): number[] {
  if (g.type === "double-pipe") return [];
  return Array.from({ length: baffleCount(g.L, g.baffleSpacing) }, (_, i) => (i + 1) * g.baffleSpacing - g.L / 2);
}

export interface NozzleSpec {
  id: "tubeIn" | "tubeOut" | "shellIn" | "shellOut";
  end: "front" | "rear";
  stream: StreamId;
  role: "in" | "out";
  side: "tube" | "shell";
}

/** Which end each stream's nozzles sit at — straight from the flow plan. */
export function nozzleLayout(input: ExchangerInput): NozzleSpec[] {
  const g = input.geometry;
  const plan = flowPlan(g);
  const endOf = (x: number): "front" | "rear" => (x <= 0 ? "front" : "rear");
  return [
    { id: "tubeIn", end: endOf(plan.tubeInletX), stream: plan.tubeStream, role: "in", side: "tube" },
    { id: "tubeOut", end: endOf(plan.tubeOutletX), stream: plan.tubeStream, role: "out", side: "tube" },
    { id: "shellIn", end: endOf(plan.shellInletX), stream: plan.shellStream, role: "in", side: "shell" },
    { id: "shellOut", end: endOf(plan.shellOutletX), stream: plan.shellStream, role: "out", side: "shell" },
  ];
}

/**
 * Honest drawing note: a multipass unit is rated with an F-corrected overall-counter-current model,
 * so the nozzle ends and flow arrows are a nominal depiction, not a pass-by-pass flow solution.
 */
export function arrangementNote(g: GeometryInput): string | null {
  if (g.type === "shell-and-tube" && g.tubePasses > 1) {
    return `This drawing is nominal: ${g.shellPasses} shell / ${g.tubePasses} tube passes is rated as overall counter-current with correction factor F; nozzle ends and arrows are indicative, and the parallel/counter selector does not apply.`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// 3-D placement helpers (still three.js-free so they are unit-testable)
// ---------------------------------------------------------------------------------------------

export interface Dims {
  Rs: number; // shell inside radius
  headLen: number;
  sheetT: number;
  nozzleR: number;
  nozzleLen: number;
  tubeExt: number; // inner-tube overhang (double-pipe)
  nozzleInset: number;
}

export function dimsOf(g: GeometryInput): Dims {
  const Rs = g.Ds / 2;
  return {
    Rs,
    headLen: Math.max(0.12, 0.45 * g.Ds),
    sheetT: 0.02,
    nozzleR: Math.min(0.06, Math.max(0.02, 0.1 * g.Ds)),
    nozzleLen: Math.max(0.1, 0.5 * g.Ds),
    tubeExt: 0.18,
    nozzleInset: Math.min(0.3, 0.12 * g.L),
  };
}

export interface NozzlePlacement {
  id: NozzleSpec["id"];
  stream: StreamId;
  role: "in" | "out";
  side: "tube" | "shell";
  /** where the nozzle meets the body (model coordinates, x ∈ [0, L]) */
  base: [number, number, number];
  /** outward unit vector */
  outward: [number, number, number];
  /** false when there is no physical nozzle (double-pipe inner-tube open end) */
  drawn: boolean;
  /** body the nozzle is attached to — controls which exploded-view group it moves with */
  parent: "shell" | "frontHead" | "rearHead" | "innerTube" | "outerPipe";
}

export function nozzlePlacements(g: GeometryInput): NozzlePlacement[] {
  const plan = flowPlan(g);
  const d = dimsOf(g);
  const out: NozzlePlacement[] = [];
  const shellX = (x: number) => (x <= 0 ? d.nozzleInset : g.L - d.nozzleInset);
  const dp = g.type === "double-pipe";
  // shell / annulus nozzles: inlet on top, outlet on bottom
  out.push({
    id: "shellIn", stream: plan.shellStream, role: "in", side: "shell",
    base: [shellX(plan.shellInletX), d.Rs, 0], outward: [0, 1, 0], drawn: true, parent: dp ? "outerPipe" : "shell",
  });
  out.push({
    id: "shellOut", stream: plan.shellStream, role: "out", side: "shell",
    base: [shellX(plan.shellOutletX), -d.Rs, 0], outward: [0, -1, 0], drawn: true, parent: dp ? "outerPipe" : "shell",
  });
  if (dp) {
    out.push({ id: "tubeIn", stream: plan.tubeStream, role: "in", side: "tube", base: [-d.tubeExt, 0, 0], outward: [-1, 0, 0], drawn: false, parent: "innerTube" });
    out.push({ id: "tubeOut", stream: plan.tubeStream, role: "out", side: "tube", base: [g.L + d.tubeExt, 0, 0], outward: [1, 0, 0], drawn: false, parent: "innerTube" });
  } else if (plan.multipass) {
    // both tube nozzles on the front head, radial; inlet bottom (band 0), outlet top
    out.push({ id: "tubeIn", stream: plan.tubeStream, role: "in", side: "tube", base: [-d.headLen / 2, -d.Rs, 0], outward: [0, -1, 0], drawn: true, parent: "frontHead" });
    out.push({ id: "tubeOut", stream: plan.tubeStream, role: "out", side: "tube", base: [-d.headLen / 2, d.Rs, 0], outward: [0, 1, 0], drawn: true, parent: "frontHead" });
  } else {
    out.push({ id: "tubeIn", stream: plan.tubeStream, role: "in", side: "tube", base: [-d.headLen, 0, 0], outward: [-1, 0, 0], drawn: true, parent: "frontHead" });
    out.push({ id: "tubeOut", stream: plan.tubeStream, role: "out", side: "tube", base: [g.L + d.headLen, 0, 0], outward: [1, 0, 0], drawn: true, parent: "rearHead" });
  }
  return out;
}

export interface ComponentInfo {
  id: string;
  name: string;
  dims: string;
}

const mm = (v: number, p = 1) => `${(v * 1000).toFixed(p)} mm`;

/** Inspectable components and their dimension text — also drives the visibility / isolate UI. */
export function componentList(g: GeometryInput, layout: TubeLayout): ComponentInfo[] {
  const d0 = dOutOf(g);
  const d = dimsOf(g);
  if (g.type === "double-pipe") {
    return [
      { id: "innerTube", name: "Inner tube", dims: `ID ${mm(g.di)}, OD ${mm(d0)}, wall ${mm(g.t, 2)}, length ${g.L} m` },
      { id: "outerPipe", name: "Outer pipe (annulus)", dims: `ID ${mm(g.Ds)}, annular gap ${mm((g.Ds - d0) / 2)}, length ${g.L} m` },
      { id: "nozzleShellIn", name: "Annulus inlet nozzle", dims: `Ø ${mm(2 * d.nozzleR, 0)}` },
      { id: "nozzleShellOut", name: "Annulus outlet nozzle", dims: `Ø ${mm(2 * d.nozzleR, 0)}` },
    ];
  }
  const nb = baffleStations(g).length;
  return [
    { id: "shell", name: "Shell", dims: `ID ${mm(g.Ds, 0)}, length ${g.L} m` },
    { id: "tubes", name: "Tube bundle", dims: `${layout.rendered} of ${g.Nt} tubes drawn, OD ${mm(d0)}, ID ${mm(g.di)}, ${g.arrangement} pitch ${mm(g.pitch)}` },
    { id: "baffles", name: "Baffles", dims: `${nb} segmental, spacing ${mm(g.baffleSpacing, 0)}, cut ${(g.baffleCut * 100).toFixed(0)} %` },
    { id: "tubesheetFront", name: "Front tubesheet", dims: `Ø ${mm(g.Ds + 0.05, 0)}, ${mm(d.sheetT, 0)} thick` },
    { id: "tubesheetRear", name: "Rear tubesheet", dims: `Ø ${mm(g.Ds + 0.05, 0)}, ${mm(d.sheetT, 0)} thick` },
    { id: "frontHead", name: "Front channel head", dims: `${g.tubePasses} tube pass${g.tubePasses > 1 ? "es" : ""}, length ${mm(d.headLen, 0)}` },
    { id: "rearHead", name: "Rear channel head", dims: `length ${mm(d.headLen, 0)}` },
    { id: "supports", name: "Saddle supports", dims: "visual only" },
    { id: "nozzleShellIn", name: "Shell-side inlet nozzle", dims: `Ø ${mm(2 * d.nozzleR, 0)}` },
    { id: "nozzleShellOut", name: "Shell-side outlet nozzle", dims: `Ø ${mm(2 * d.nozzleR, 0)}` },
    { id: "nozzleTubeIn", name: "Tube-side inlet nozzle", dims: `Ø ${mm(2 * d.nozzleR, 0)}` },
    { id: "nozzleTubeOut", name: "Tube-side outlet nozzle", dims: `Ø ${mm(2 * d.nozzleR, 0)}` },
  ];
}
