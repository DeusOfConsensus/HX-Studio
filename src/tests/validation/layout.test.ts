import { describe, expect, it } from "vitest";
import {
  arrangementNote,
  baffleCount,
  baffleXs,
  layoutTubes,
  nozzleLayout,
  shellClearance,
} from "../../three/geometries/layout";
import { sampleConfiguration, sampleDoublePipe } from "../../engineering/sampleConfiguration";
import { shellSideHydraulics } from "../../engineering/calculations/hydraulics";
import type { ExchangerInput } from "../../engineering/types";

const clone = (x: ExchangerInput): ExchangerInput => JSON.parse(JSON.stringify(x));
const g = sampleConfiguration.geometry;
const dOut = g.di + 2 * g.t;

describe("tube layout", () => {
  const l = layoutTubes(g.Nt, g.pitch, g.arrangement, g.Ds, dOut, g.tubePasses);
  it("places exactly the requested tubes when they fit", () => {
    expect(l.fits).toBe(true);
    expect(l.placed).toBe(g.Nt);
    expect(l.positions).toHaveLength(g.Nt);
  });
  it("every tube lies inside the shell with clearance", () => {
    for (const [y, z] of l.positions) {
      expect(Math.hypot(y, z) + dOut / 2).toBeLessThanOrEqual(g.Ds / 2 - shellClearance(g.Ds) + 1e-9);
    }
  });
  it("no two tubes overlap: centre spacing ≥ pitch (triangular)", () => {
    let min = Infinity;
    for (let i = 0; i < l.positions.length; i++)
      for (let j = i + 1; j < l.positions.length; j++) {
        min = Math.min(min, Math.hypot(l.positions[i][0] - l.positions[j][0], l.positions[i][1] - l.positions[j][1]));
      }
    expect(min).toBeGreaterThanOrEqual(g.pitch - 1e-9);
    expect(min).toBeGreaterThan(dOut);
  });
  it("square arrangement also keeps pitch spacing", () => {
    const sq = layoutTubes(30, g.pitch, "square", g.Ds, dOut);
    let min = Infinity;
    for (let i = 0; i < sq.positions.length; i++)
      for (let j = i + 1; j < sq.positions.length; j++)
        min = Math.min(min, Math.hypot(sq.positions[i][0] - sq.positions[j][0], sq.positions[i][1] - sq.positions[j][1]));
    expect(min).toBeGreaterThanOrEqual(g.pitch - 1e-9);
  });
  it("tube passes split tubes (near-)equally and use every pass index", () => {
    const counts = new Array(g.tubePasses).fill(0);
    l.passIndex.forEach((p) => counts[p]++);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.every((c) => c > 0)).toBe(true);
  });
  it("reports a capacity shortfall instead of drawing impossible tubes", () => {
    const big = layoutTubes(500, g.pitch, g.arrangement, g.Ds, dOut);
    expect(big.fits).toBe(false);
    expect(big.placed).toBe(big.capacity);
    expect(big.placed).toBeLessThan(500);
  });
  it("larger shell diameter → larger capacity; larger pitch → smaller capacity", () => {
    const a = layoutTubes(1, g.pitch, g.arrangement, 0.3, dOut).capacity;
    const b = layoutTubes(1, g.pitch, g.arrangement, 0.5, dOut).capacity;
    const c = layoutTubes(1, g.pitch * 1.5, g.arrangement, 0.5, dOut).capacity;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeLessThan(b);
  });
});

describe("baffles", () => {
  it("count matches the calculation engine's Nb formula for the same inputs", () => {
    const xs = baffleXs(g);
    expect(xs.length).toBe(baffleCount(g.L, g.baffleSpacing));
    const hyd = shellSideHydraulics(g, 2, { rho: 975, cp: 4190, mu: 4e-4, k: 0.66 });
    expect(hyd.notes.join(" ")).toContain(`Nb = ${xs.length}`);
  });
  it("baffles are spaced exactly B apart and stay inside the tube length", () => {
    const xs = baffleXs(g);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(g.baffleSpacing, 10);
    expect(xs[0]).toBeGreaterThan(-g.L / 2);
    expect(xs[xs.length - 1]).toBeLessThan(g.L / 2);
  });
  it("spacing ≥ L gives no baffles", () => {
    expect(baffleCount(2.44, 3)).toBe(0);
  });
});

describe("nozzle placement follows the engineering configuration", () => {
  const get = (specs: ReturnType<typeof nozzleLayout>, id: string) => specs.find((s) => s.id === id)!;

  it("double-pipe parallel: both inlets at the same (front) end, both outlets at the rear", () => {
    const x = clone(sampleDoublePipe);
    x.geometry.flow = "parallel";
    const n = nozzleLayout(x);
    expect(get(n, "tubeIn").end).toBe("front");
    expect(get(n, "shellIn").end).toBe("front");
    expect(get(n, "tubeOut").end).toBe("rear");
    expect(get(n, "shellOut").end).toBe("rear");
  });
  it("double-pipe counter: inlets at opposite ends", () => {
    const x = clone(sampleDoublePipe);
    x.geometry.flow = "counter";
    const n = nozzleLayout(x);
    expect(get(n, "tubeIn").end).toBe("front");
    expect(get(n, "shellIn").end).toBe("rear");
    expect(get(n, "tubeOut").end).toBe("rear");
    expect(get(n, "shellOut").end).toBe("front");
  });
  it("hot/cold streams are assigned to the correct pipe", () => {
    const x = clone(sampleDoublePipe);
    x.geometry.tubeSideStream = "hot";
    const n = nozzleLayout(x);
    expect(get(n, "tubeIn").stream).toBe("hot");
    expect(get(n, "shellIn").stream).toBe("cold");
  });
  it("inlet and outlet of each stream are at different ends for single-pass units", () => {
    for (const flow of ["parallel", "counter"] as const) {
      const x = clone(sampleDoublePipe);
      x.geometry.flow = flow;
      const n = nozzleLayout(x);
      expect(get(n, "tubeIn").end).not.toBe(get(n, "tubeOut").end);
      expect(get(n, "shellIn").end).not.toBe(get(n, "shellOut").end);
    }
  });
  it("multipass S&T: tube in/out both at the front head and the drawing is flagged nominal", () => {
    const n = nozzleLayout(sampleConfiguration);
    expect(get(n, "tubeIn").end).toBe("front");
    expect(get(n, "tubeOut").end).toBe("front");
    expect(arrangementNote(sampleConfiguration.geometry)).toMatch(/nominal/);
  });
  it("single-pass S&T honours the flow flag", () => {
    const x = clone(sampleConfiguration);
    x.geometry.tubePasses = 1;
    x.geometry.flow = "parallel";
    let n = nozzleLayout(x);
    expect(get(n, "shellIn").end).toBe(get(n, "tubeIn").end);
    x.geometry.flow = "counter";
    n = nozzleLayout(x);
    expect(get(n, "shellIn").end).not.toBe(get(n, "tubeIn").end);
    expect(arrangementNote(x.geometry)).toBeNull();
  });
});
