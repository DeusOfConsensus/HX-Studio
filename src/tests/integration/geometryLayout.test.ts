import { describe, expect, it } from "vitest";
import { baffleStations, flowPlan, shellProgress, tubeLayout, tubeProgress, MAX_RENDERED_TUBES } from "../../three/geometries/layout";
import { streamTemperature, thermalBin, THERMAL_PALETTE } from "../../three/visualizations/thermalField";
import { evaluate } from "../../simulation/solvers/exchangerSolver";
import { sampleConfiguration, sampleDoublePipe } from "../../engineering/sampleConfiguration";
import type { ExchangerInput } from "../../engineering/types";

const clone = (x: ExchangerInput): ExchangerInput => JSON.parse(JSON.stringify(x));

describe("tube layout", () => {
  const g = sampleConfiguration.geometry;
  const lay = tubeLayout(g);
  const d0 = g.di + 2 * g.t;

  it("sample configuration fits and renders exactly Nt tubes", () => {
    expect(lay.fitsShell).toBe(true);
    expect(lay.rendered).toBe(g.Nt);
    expect(lay.tubes).toHaveLength(g.Nt);
  });
  it("every tube lies inside the shell with clearance", () => {
    for (const t of lay.tubes) expect(Math.hypot(t.y, t.z) + d0 / 2).toBeLessThanOrEqual(g.Ds / 2 + 1e-9);
  });
  it("tube spacing is at least the pitch (no overlaps)", () => {
    for (let i = 0; i < lay.tubes.length; i++)
      for (let j = i + 1; j < lay.tubes.length; j++) {
        const d = Math.hypot(lay.tubes[i].y - lay.tubes[j].y, lay.tubes[i].z - lay.tubes[j].z);
        expect(d).toBeGreaterThanOrEqual(g.pitch * 0.999);
      }
  });
  it("pitch drives capacity: tighter pitch fits more tubes", () => {
    const tight = tubeLayout({ ...g, pitch: 0.0238 });
    const loose = tubeLayout({ ...g, pitch: 0.032 });
    expect(tight.capacity).toBeGreaterThan(lay.capacity);
    expect(loose.capacity).toBeLessThan(lay.capacity);
  });
  it("square arrangement has lower capacity than triangular at the same pitch", () => {
    // at 203 mm the lattice is too coarse to separate them (both 37), so compare in a larger shell
    expect(tubeLayout({ ...g, Ds: 0.45, arrangement: "square" }).capacity).toBeLessThan(tubeLayout({ ...g, Ds: 0.45 }).capacity);
  });
  it("shell diameter drives capacity", () => {
    expect(tubeLayout({ ...g, Ds: 0.3 }).capacity).toBeGreaterThan(lay.capacity);
  });
  it("too many tubes: reports misfit instead of silently drawing fewer", () => {
    const over = tubeLayout({ ...g, Nt: 500 });
    expect(over.fitsShell).toBe(false);
    expect(over.rendered).toBe(over.capacity);
    expect(over.rendered).toBeLessThan(500);
    expect(over.requested).toBe(500);
  });
  it("performance cap is explicit", () => {
    const big = tubeLayout({ ...g, Ds: 1.4, Nt: 1500 });
    expect(big.fitsShell).toBe(true);
    expect(big.rendered).toBe(MAX_RENDERED_TUBES);
    expect(big.capped).toBe(true);
  });
  it("passes split tubes into balanced bands with ordered boundaries", () => {
    const sizes = [0, 1].map((p) => lay.tubes.filter((t) => t.pass === p).length);
    expect(Math.abs(sizes[0] - sizes[1])).toBeLessThanOrEqual(1);
    expect(lay.passBoundaries).toHaveLength(1);
    const four = tubeLayout({ ...g, tubePasses: 4 });
    expect(four.passBoundaries).toHaveLength(3);
    expect([...four.passBoundaries].sort((a, b) => a - b)).toEqual(four.passBoundaries);
  });
  it("double-pipe has exactly one tube", () => expect(tubeLayout(sampleDoublePipe.geometry).rendered).toBe(1));
});

describe("baffles", () => {
  it("count equals the solver's Nb and spacing equals B", () => {
    const g = sampleConfiguration.geometry;
    const st = baffleStations(g);
    expect(st).toHaveLength(Math.ceil(g.L / g.baffleSpacing) - 1);
    expect(st[1] - st[0]).toBeCloseTo(g.baffleSpacing, 12);
    expect(st[st.length - 1]).toBeLessThan(g.L);
  });
  it("changing baffle spacing changes baffle count", () => {
    const g = sampleConfiguration.geometry;
    expect(baffleStations({ ...g, baffleSpacing: 0.2 }).length).toBeLessThan(baffleStations(g).length);
  });
});

describe("flow plan matches the engineering configuration", () => {
  const dp = sampleDoublePipe.geometry;
  it("parallel: both streams enter at the front and exit at the rear", () => {
    const p = flowPlan({ ...dp, flow: "parallel" });
    expect(p.tubeInletX).toBe(0);
    expect(p.shellInletX).toBe(0);
    expect(p.shellOutletX).toBe(dp.L);
    expect(p.tubeOutletX).toBe(dp.L);
    expect(p.shellDir).toBe(1);
  });
  it("counter: streams enter at opposite ends", () => {
    const p = flowPlan({ ...dp, flow: "counter" });
    expect(p.tubeInletX).toBe(0);
    expect(p.shellInletX).toBe(dp.L);
    expect(p.shellDir).toBe(-1);
  });
  it("multipass shell-and-tube ignores the idealised flag and is overall counter-current (as in the solver)", () => {
    const g = sampleConfiguration.geometry;
    const a = flowPlan({ ...g, flow: "parallel" });
    const b = flowPlan({ ...g, flow: "counter" });
    expect(a.multipass).toBe(true);
    expect(a.shellDir).toBe(-1);
    expect(b.shellDir).toBe(-1);
    expect(a.tubeOutletX).toBe(0); // even passes return to the front head
  });
  it("tube pass directions alternate", () => {
    const p = flowPlan(sampleConfiguration.geometry);
    expect([0, 1, 2, 3].map(p.tubePassDir)).toEqual([1, -1, 1, -1]);
  });
  it("progress functions", () => {
    const p = flowPlan({ ...dp, flow: "counter" });
    expect(shellProgress(p, dp.L, dp.L)).toBe(0);
    expect(shellProgress(p, dp.L, 0)).toBe(1);
    const m = flowPlan(sampleConfiguration.geometry);
    expect(tubeProgress(m, 1, 0.5)).toBeCloseTo(0.75, 12);
  });
});

describe("thermal field is grounded in the solver profile", () => {
  for (const flow of ["parallel", "counter"] as const) {
    it(`double-pipe ${flow}: stream temperatures at inlets/outlets equal solved terminal temperatures`, () => {
      const x = clone(sampleDoublePipe);
      x.geometry.flow = flow;
      const e = evaluate(x);
      const s = e.state!;
      const prof = e.profile!;
      expect(streamTemperature(prof, "hot", 0)).toBeCloseTo(s.ThIn, 6);
      expect(streamTemperature(prof, "hot", 1)).toBeCloseTo(s.ThOut, 2);
      expect(streamTemperature(prof, "cold", 0)).toBeCloseTo(s.TcIn, 6);
      expect(streamTemperature(prof, "cold", 1)).toBeCloseTo(s.TcOut, 2);
    });
    it(`double-pipe ${flow}: physical x lookup agrees (hot inlet end is the hot-stream start)`, () => {
      const x = clone(sampleDoublePipe);
      x.geometry.flow = flow;
      x.geometry.tubeSideStream = "hot"; // hot in the tube, enters at x = 0
      const e = evaluate(x);
      const plan = flowPlan(x.geometry);
      const prof = e.profile!;
      const Tcold_at_front = streamTemperature(prof, "cold", shellProgress(plan, x.geometry.L, 0));
      const Tcold_at_rear = streamTemperature(prof, "cold", shellProgress(plan, x.geometry.L, x.geometry.L));
      if (flow === "parallel") {
        expect(Tcold_at_front).toBeCloseTo(e.state!.TcIn, 6);
        expect(Tcold_at_rear).toBeCloseTo(e.state!.TcOut, 2);
      } else {
        expect(Tcold_at_rear).toBeCloseTo(e.state!.TcIn, 6);
        expect(Tcold_at_front).toBeCloseTo(e.state!.TcOut, 2);
      }
    });
  }
  it("palette is discrete, clamps, and has no NaN path", () => {
    expect(thermalBin(10, 20, 80)).toBe(0);
    expect(thermalBin(100, 20, 80)).toBe(THERMAL_PALETTE.length - 1);
    expect(thermalBin(50, 50, 50)).toBe(0);
    expect(thermalBin(50, 20, 80)).toBe(Math.floor(0.5 * THERMAL_PALETTE.length));
  });
});
