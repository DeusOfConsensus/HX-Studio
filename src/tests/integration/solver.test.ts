import { describe, expect, it } from "vitest";
import { evaluate } from "../../simulation/solvers/exchangerSolver";
import { solveSizing } from "../../simulation/solvers/sizing";
import { temperatureProfile } from "../../simulation/temperatureProfiles/profile";
import { epsCounter, epsParallel } from "../../engineering/correlations/effectivenessNtu";
import { sampleConfiguration, sampleDoublePipe } from "../../engineering/sampleConfiguration";
import type { ExchangerInput } from "../../engineering/types";

const get = (e: ReturnType<typeof evaluate>, id: string) => e.parameters.find((p) => p.id === id)!;
const clone = (x: ExchangerInput): ExchangerInput => JSON.parse(JSON.stringify(x));

describe("sample configuration (shell-and-tube, 1 shell / 2 tube passes)", () => {
  const e = evaluate(sampleConfiguration);

  it("evaluates without errors and returns all 15 parameters", () => {
    expect(e.ok).toBe(true);
    expect(e.parameters).toHaveLength(15);
    for (const p of e.parameters) {
      expect(p.value, p.id).not.toBeNull();
      expect(Number.isFinite(p.value!), p.id).toBe(true);
      expect(p.formula.length, p.id).toBeGreaterThan(0);
      expect(p.status, p.id).not.toBe("invalid");
    }
  });

  it("energy balance closes in rating mode", () => {
    const q = get(e, "Q");
    expect(q.details.Qh).toBeCloseTo(q.details.Qc as number, 3);
    expect(e.state!.Q).toBeGreaterThan(0);
  });

  it("temperatures are physically ordered", () => {
    const s = e.state!;
    expect(s.ThOut).toBeLessThan(s.ThIn);
    expect(s.TcOut).toBeGreaterThan(s.TcIn);
    expect(s.ThOut).toBeGreaterThan(s.TcIn);
    expect(s.TcOut).toBeLessThan(s.ThIn);
  });

  it("self-consistency: required area from Q/(U·F·LMTD) equals available area (ε–NTU vs LMTD routes agree)", () => {
    const s = e.state!;
    expect(s.areaRequired!).toBeCloseTo(s.net.Ao, 4);
    expect(s.F!).toBeGreaterThan(0.5);
    expect(s.F!).toBeLessThanOrEqual(1);
  });

  it("effectiveness lies in (0,1) and equals Q/Qmax", () => {
    const s = e.state!;
    expect(s.eps).toBeGreaterThan(0);
    expect(s.eps).toBeLessThan(1);
    expect(s.eps).toBeCloseTo(s.Q / (s.Cmin * (s.ThIn - s.TcIn)), 10);
  });

  it("U is physically sensible for water–water S&T (≈ 500–3500 W/m²K)", () => {
    const U = get(e, "U").value!;
    expect(U).toBeGreaterThan(500);
    expect(U).toBeLessThan(3500);
    expect(get(e, "U").details.UoClean).toBeGreaterThan(U);
  });

  it("thermal-resistance components sum to the total and match 1/(U·Ao)", () => {
    const d = get(e, "Rth").details as Record<string, number>;
    const sum = d.innerConvection + d.innerFouling + d.wall + d.outerFouling + d.outerConvection;
    expect(sum).toBeCloseTo(get(e, "Rth").value!, 12);
    expect(d.totalAreaNormalised).toBeCloseTo(1 / get(e, "U").value!, 9);
  });

  it("tube-side velocity accounts for tubes per pass", () => {
    const g = sampleConfiguration.geometry;
    const v = get(e, "v").value!;
    const rho = e.state!.propsCold.rho;
    const expected = 3.0 / rho / ((g.Nt / g.tubePasses) * (Math.PI / 4) * g.di * g.di);
    expect(v).toBeCloseTo(expected, 8);
  });

  it("pressure drop and pumping power are positive and consistent with ΔP·Qv/η", () => {
    const dp = get(e, "dP");
    expect(dp.value!).toBeGreaterThan(0);
    expect(dp.details.shellSide as number).toBeGreaterThan(0);
    const w = get(e, "Wpump").details as Record<string, number>;
    expect(w.tubeElectrical).toBeCloseTo(w.tubeHydraulic / sampleConfiguration.operating.pumpEfficiency, 8);
  });

  it("multipass profile is flagged as an equivalent representation, not a resolved multipass profile", () => {
    expect(e.profile!.equivalentRepresentation).toBe(true);
  });

  it("temperature profile reproduces solved outlet temperatures", () => {
    const p = e.profile!;
    const n = p.xi.length - 1;
    expect(p.Th[0]).toBeCloseTo(e.state!.ThIn, 8);
    expect(p.Th[n]).toBeCloseTo(e.state!.ThOut, 3);
    // counter representation: cold outlet at ξ = 0, cold inlet at ξ = 1
    expect(p.Tc[0]).toBeCloseTo(e.state!.TcOut, 3);
    expect(p.Tc[n]).toBeCloseTo(e.state!.TcIn, 3);
  });
});

describe("flow arrangement is a real engineering configuration (double-pipe)", () => {
  const counter = evaluate({ ...clone(sampleDoublePipe), geometry: { ...sampleDoublePipe.geometry, flow: "counter" } });
  const parallel = evaluate({ ...clone(sampleDoublePipe), geometry: { ...sampleDoublePipe.geometry, flow: "parallel" } });

  it("both solve", () => {
    expect(counter.ok).toBe(true);
    expect(parallel.ok).toBe(true);
  });
  it("counterflow transfers more heat and has higher ε for identical geometry/flows", () => {
    expect(counter.state!.Q).toBeGreaterThan(parallel.state!.Q);
    expect(counter.state!.eps).toBeGreaterThan(parallel.state!.eps);
  });
  it("rating-mode ε matches the textbook relation evaluated at the converged NTU, Cr", () => {
    const s = counter.state!;
    expect(s.eps).toBeCloseTo(epsCounter(s.ntuAvailable, s.Cr), 6);
    const p = parallel.state!;
    expect(p.eps).toBeCloseTo(epsParallel(p.ntuAvailable, p.Cr), 6);
  });
  it("LMTD terminal differences differ between arrangements", () => {
    expect(counter.state!.lmtdInfo!.formula).toMatch(/Th,in − Tc,out/);
    expect(parallel.state!.lmtdInfo!.formula).toMatch(/Th,in − Tc,in/);
  });
  it("F = 1 for single-pass units; required area equals available (consistency)", () => {
    expect(counter.state!.F).toBe(1);
    expect(counter.state!.areaRequired!).toBeCloseTo(counter.state!.net.Ao, 4);
    expect(parallel.state!.areaRequired!).toBeCloseTo(parallel.state!.net.Ao, 4);
  });
  it("profiles: parallel streams converge toward each other; counter hot/cold both monotone in opposite senses", () => {
    const pp = parallel.profile!;
    const gapStart = pp.Th[0] - pp.Tc[0];
    const gapEnd = pp.Th[pp.Th.length - 1] - pp.Tc[pp.Tc.length - 1];
    expect(gapEnd).toBeLessThan(gapStart);
    expect(pp.Tc[pp.Tc.length - 1]).toBeLessThan(pp.Th[pp.Th.length - 1]); // no cross in parallel flow
    const cp = counter.profile!;
    expect(cp.equivalentRepresentation).toBe(false);
    expect(cp.Tc[0]).toBeGreaterThan(cp.Tc[cp.Tc.length - 1]); // cold flows from ξ=1 toward ξ=0, warming
  });
  it("profile outlet matches ε–NTU analytic outlets for parallel flow", () => {
    const s = parallel.state!;
    const p = parallel.profile!;
    expect(p.Th[p.Th.length - 1]).toBeCloseTo(s.ThOut, 3);
    expect(p.Tc[p.Tc.length - 1]).toBeCloseTo(s.TcOut, 3);
  });
});

describe("duty mode", () => {
  const duty: ExchangerInput = {
    ...clone(sampleConfiguration),
    mode: "duty",
    // consistent duty: Q = 2·cp·(85−60); cold outlet chosen from the same Q (cp at ~ means) — small
    // discrepancy is expected and must be REPORTED, not hidden
    hot: { ...sampleConfiguration.hot, Tout: 60 },
    cold: { ...sampleConfiguration.cold, Tout: 25 + (2 * 4190 * 25) / (3 * 4180) },
  };
  const e = evaluate(duty);
  it("solves and reports the energy-balance discrepancy explicitly", () => {
    expect(e.ok).toBe(true);
    const d = get(e, "Q").details.discrepancyPct as number;
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(5);
  });
  it("inconsistent hot/cold duties raise a warning, not a silent equalisation", () => {
    const bad = clone(duty);
    bad.cold.Tout = 40; // far from the hot-side duty
    const eb = evaluate(bad);
    expect(eb.issues.some((i) => i.code === "ENERGY_BALANCE")).toBe(true);
    expect(get(eb, "Q").status).toBe("warning");
    expect(get(eb, "Q").details.Qh).not.toBeCloseTo(get(eb, "Q").details.Qc as number, 0);
  });
  it("Q source selection changes the duty used", () => {
    const hot = evaluate({ ...duty, dutySource: "hot" });
    const cold = evaluate({ ...duty, dutySource: "cold", cold: { ...duty.cold, Tout: 40 } });
    expect(hot.state!.Q).not.toBeCloseTo(cold.state!.Q, 0);
    const spec = evaluate({ ...duty, dutySource: "specified", specifiedQ: 123456 });
    expect(spec.state!.Q).toBe(123456);
  });
});

describe("validation and failure handling (no silent zeros)", () => {
  it("hot inlet below cold inlet → error, all parameters unavailable with null value", () => {
    const x = clone(sampleConfiguration);
    x.hot.Tin = 20;
    const e = evaluate(x);
    expect(e.ok).toBe(false);
    expect(e.issues.some((i) => i.code === "T_ORDER")).toBe(true);
    for (const p of e.parameters) expect(p.value).toBeNull();
  });
  it("temperatures below absolute zero rejected", () => {
    const x = clone(sampleConfiguration);
    x.cold.Tin = -300;
    expect(evaluate(x).ok).toBe(false);
  });
  it("zero / negative flow rejected", () => {
    const x = clone(sampleConfiguration);
    x.hot.mdot = 0;
    expect(evaluate(x).ok).toBe(false);
    x.hot.mdot = -1;
    expect(evaluate(x).ok).toBe(false);
  });
  it("tube wall impossible (t ≤ 0) rejected", () => {
    const x = clone(sampleConfiguration);
    x.geometry.t = 0;
    expect(evaluate(x).ok).toBe(false);
  });
  it("pitch ≤ do rejected; annulus with Ds ≤ do rejected", () => {
    const x = clone(sampleConfiguration);
    x.geometry.pitch = 0.015;
    expect(evaluate(x).issues.some((i) => i.code === "PITCH")).toBe(true);
    const d = clone(sampleDoublePipe);
    d.geometry.Ds = 0.02;
    expect(evaluate(d).issues.some((i) => i.code === "ANNULUS")).toBe(true);
  });
  it("odd tube-pass count (>1) rejected rather than mis-modelled", () => {
    const x = clone(sampleConfiguration);
    x.geometry.tubePasses = 3;
    expect(evaluate(x).issues.some((i) => i.code === "ODD_PASSES")).toBe(true);
  });
  it("missing fluid properties are reported, not invented", () => {
    const x = clone(sampleConfiguration);
    x.hot.fluidId = "thermal-oil";
    const e = evaluate(x);
    expect(e.ok).toBe(false);
    expect(e.issues.some((i) => i.code === "PROPS")).toBe(true);
  });
  it("parallel-flow temperature cross in duty mode is rejected", () => {
    const x = clone(sampleDoublePipe);
    x.mode = "duty";
    x.geometry.flow = "parallel";
    x.hot.Tout = 40;
    x.cold.Tout = 60;
    const e = evaluate(x);
    expect(e.ok).toBe(false);
    expect(e.issues.some((i) => i.code === "PARALLEL_CROSS")).toBe(true);
  });
  it("multipass duty with unreachable terminals flags infeasible F (temperature cross)", () => {
    const x = clone(sampleConfiguration);
    x.mode = "duty";
    x.hot.Tout = 30;
    x.cold.Tout = 80; // cold outlet far above hot outlet
    const e = evaluate(x);
    expect(e.issues.some((i) => i.code === "F_INFEASIBLE")).toBe(true);
    expect(get(e, "A").value).toBeNull();
  });
  it("manual properties work and are flagged as constant", () => {
    const x = clone(sampleConfiguration);
    x.hot = { ...x.hot, fluidId: undefined, manual: { rho: 850, cp: 2100, mu: 4e-3, k: 0.13 } };
    const e = evaluate(x);
    expect(e.issues.some((i) => i.code === "PROPS_MANUAL")).toBe(true);
    expect(e.state!.propsHot.rho).toBe(850);
  });
});

describe("input influence (every input must affect the result)", () => {
  const base = evaluate(sampleConfiguration).state!;
  const variants: Array<[string, (x: ExchangerInput) => void]> = [
    ["hot mass flow", (x) => (x.hot.mdot *= 1.5)],
    ["cold mass flow", (x) => (x.cold.mdot *= 1.5)],
    ["hot inlet T", (x) => (x.hot.Tin += 10)],
    ["tube length", (x) => (x.geometry.L *= 1.5)],
    ["tube count", (x) => (x.geometry.Nt += 10)],
    ["tube id", (x) => (x.geometry.di *= 1.2)],
    ["wall conductivity", (x) => (x.geometry.kw = 400)],
    ["fouling", (x) => (x.operating.Rfi *= 3)],
    ["baffle spacing", (x) => (x.geometry.baffleSpacing = 0.2)],
    ["pitch", (x) => (x.geometry.pitch = 0.032)],
    ["tube passes", (x) => (x.geometry.tubePasses = 4)],
  ];
  for (const [name, mut] of variants) {
    it(`changing ${name} changes results`, () => {
      const x = clone(sampleConfiguration);
      mut(x);
      const e = evaluate(x);
      expect(e.ok).toBe(true);
      const s = e.state!;
      const changed = Math.abs(s.Q - base.Q) > 1e-6 * base.Q || Math.abs(s.shell.dP - base.shell.dP) > 1e-6 * base.shell.dP || Math.abs(s.tube.dP - base.tube.dP) > 1e-6 * base.tube.dP;
      expect(changed).toBe(true);
    });
  }
  it("more fouling reduces U, Q", () => {
    const x = clone(sampleConfiguration);
    x.operating.Rfi *= 3;
    const s = evaluate(x).state!;
    expect(s.net.Uo).toBeLessThan(base.net.Uo);
    expect(s.Q).toBeLessThan(base.Q);
  });
  it("longer tubes → higher Q, higher tube-side ΔP", () => {
    const x = clone(sampleConfiguration);
    x.geometry.L *= 1.5;
    const s = evaluate(x).state!;
    expect(s.Q).toBeGreaterThan(base.Q);
    expect(s.tube.dP).toBeGreaterThan(base.tube.dP);
  });
  it("tighter baffle spacing raises shell-side ΔP", () => {
    const x = clone(sampleConfiguration);
    x.geometry.baffleSpacing = 0.05;
    expect(evaluate(x).state!.shell.dP).toBeGreaterThan(base.shell.dP);
  });
  it("explicit correlation choice changes the reported correlation", () => {
    const x = clone(sampleConfiguration);
    x.operating.correlation = "dittus-boelter";
    const e = evaluate(x);
    expect(get(e, "Nu").details.tubeCorrelation).toMatch(/Dittus/);
  });
});

describe("temperature profile solver", () => {
  it("parallel flow matches the closed-form outlet temperatures", () => {
    // Ch=2000, Cc=1000, UA=1500 → NTU=1.5, Cr=0.5; ε=(1−e^−2.25)/1.5 = 0.5963
    const p = temperatureProfile({ arrangement: "parallel", UA: 1500, Ch: 2000, Cc: 1000, ThIn: 100, TcIn: 20 });
    const eps = epsParallel(1.5, 0.5);
    const Q = eps * 1000 * 80;
    expect(p.Th[p.Th.length - 1]).toBeCloseTo(100 - Q / 2000, 5);
    expect(p.Tc[p.Tc.length - 1]).toBeCloseTo(20 + Q / 1000, 5);
  });
  it("counterflow matches the closed-form outlet temperatures", () => {
    const p = temperatureProfile({ arrangement: "counter", UA: 1500, Ch: 2000, Cc: 1000, ThIn: 100, TcIn: 20 });
    const eps = epsCounter(1.5, 0.5);
    const Q = eps * 1000 * 80;
    expect(p.Th[p.Th.length - 1]).toBeCloseTo(100 - Q / 2000, 5);
    expect(p.Tc[0]).toBeCloseTo(20 + Q / 1000, 5);
  });
  it("overall energy balance along the profile", () => {
    const p = temperatureProfile({ arrangement: "counter", UA: 900, Ch: 1500, Cc: 1200, ThIn: 90, TcIn: 15 });
    const n = p.xi.length - 1;
    expect(1500 * (p.Th[0] - p.Th[n])).toBeCloseTo(1200 * (p.Tc[0] - p.Tc[n]), 4);
  });
});

describe("design-mode sizing", () => {
  const duty: ExchangerInput = {
    ...clone(sampleConfiguration),
    mode: "duty",
    hot: { ...sampleConfiguration.hot, Tout: 65 },
    cold: { ...sampleConfiguration.cold, Tout: 25 + (2 * 4190 * 20) / (3 * 4180) },
  };
  it("rating mode is underdetermined for sizing and says so", () => {
    const r = solveSizing(clone(sampleConfiguration), "L");
    expect(r.status).toBe("underdetermined");
    expect(r.value).toBeNull();
  });
  it("solves tube length so that available area ≈ required area", () => {
    const r = solveSizing(duty, "L");
    expect(r.status).toBe("solved");
    expect(r.areaAvailable!).toBeCloseTo(r.areaRequired!, 3);
    expect(r.value!).toBeGreaterThan(0.1);
  });
  it("solved tube count is an integer with adequate (≥) area", () => {
    const r = solveSizing(duty, "Nt");
    if (r.status === "solved") {
      expect(Number.isInteger(r.value!)).toBe(true);
      expect(r.areaAvailable!).toBeGreaterThanOrEqual(r.areaRequired! - 1e-9);
    } else {
      expect(["no_bracket", "invalid"]).toContain(r.status);
    }
  });
  it("lists fixed and unknown variables explicitly", () => {
    const r = solveSizing(duty, "L");
    expect(r.unknown).toBe("L");
    expect(r.fixed).not.toContain("L");
    expect(r.fixed).toContain("Nt");
  });
});
