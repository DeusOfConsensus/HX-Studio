/**
 * Reference values are either (a) hand-calculated from the governing equations (arithmetic shown
 * in comments) or (b) standard textbook values. Nothing was tuned to make code output pass.
 */
import { describe, expect, it } from "vitest";
import { convert, convertTempDelta, fromCelsius, toCelsius, toSI, fromSI } from "../../engineering/units/conversions";
import { computeLmtd, lmtd } from "../../engineering/calculations/lmtd";
import {
  bowmanF1,
  correctionFactor,
  epsCounter,
  epsParallel,
  epsShell1,
  epsShellN,
  ntuCounter,
  ntuParallel,
  ntuShellN,
} from "../../engineering/correlations/effectivenessNtu";
import { dittusBoelter, gnielinski, hausenLaminar, nusseltInternal } from "../../engineering/correlations/tubeSide";
import { darcyFriction, haaland } from "../../engineering/correlations/frictionFactors";
import { kernEquivalentDiameter } from "../../engineering/correlations/shellSide";
import { getFluidProperties } from "../../engineering/properties/fluidDatabase";
import { prandtl, effectiveFouling, resistanceNetwork } from "../../engineering/calculations/overallCoefficient";
import { outsideArea, outsideDiameter } from "../../engineering/calculations/geometrySizing";
import { pumpingPower } from "../../engineering/calculations/hydraulics";
import { sampleConfiguration } from "../../engineering/sampleConfiguration";

describe("unit conversions", () => {
  it("absolute temperature: 0 °C = 273.15 K = 32 °F", () => {
    expect(fromCelsius(0, "K")).toBeCloseTo(273.15, 10);
    expect(fromCelsius(0, "°F")).toBeCloseTo(32, 10);
    expect(toCelsius(212, "°F")).toBeCloseTo(100, 10);
  });
  it("temperature DIFFERENCE has no offset: 10 K = 18 °F", () => {
    expect(convertTempDelta(10, "K", "°F")).toBeCloseTo(18, 10);
    expect(convertTempDelta(18, "°F", "°C")).toBeCloseTo(10, 10);
  });
  it("flow, pressure, power, length", () => {
    expect(convert(3600, "massFlow", "kg/h", "kg/s")).toBeCloseTo(1, 12);
    expect(convert(1, "pressure", "bar", "Pa")).toBeCloseTo(1e5, 6);
    expect(convert(101.325, "pressure", "kPa", "bar")).toBeCloseTo(1.01325, 10);
    expect(convert(2.5, "power", "kW", "W")).toBe(2500);
    expect(convert(19.05, "length", "mm", "in")).toBeCloseTo(0.75, 10);
    expect(convert(3600, "volFlow", "m3/h", "m3/s")).toBeCloseTo(1, 12);
  });
  it("round trip through SI is identity", () => {
    for (const [cat, unit, v] of [["pressure", "psi", 14.7], ["htc", "BTU/h-ft2-F", 100], ["fouling", "h-ft2-F/BTU", 0.001]] as const) {
      expect(fromSI(toSI(v, cat, unit), cat, unit)).toBeCloseTo(v, 10);
    }
  });
});

describe("LMTD", () => {
  // Counterflow: dT1 = 100−50 = 50, dT2 = 60−20 = 40 → 10/ln(1.25) = 44.814
  it("counterflow terminal differences", () => {
    const r = computeLmtd("counter", 100, 60, 20, 50)!;
    expect(r.dT1).toBe(50);
    expect(r.dT2).toBe(40);
    expect(r.lmtd).toBeCloseTo(44.814, 3);
  });
  // Parallel: dT1 = 100−20 = 80, dT2 = 60−50 = 10 → 70/ln 8 = 70/2.07944 = 33.663
  it("parallel terminal differences", () => {
    const r = computeLmtd("parallel", 100, 60, 20, 50)!;
    expect(r.dT1).toBe(80);
    expect(r.dT2).toBe(10);
    expect(r.lmtd).toBeCloseTo(33.663, 3);
  });
  it("counterflow LMTD exceeds parallel for the same terminals", () => {
    expect(computeLmtd("counter", 100, 60, 20, 50)!.lmtd).toBeGreaterThan(computeLmtd("parallel", 100, 60, 20, 50)!.lmtd);
  });
  it("equal terminal differences → limiting value, no NaN", () => {
    expect(lmtd(30, 30)).toBe(30);
    expect(lmtd(30, 30 + 1e-9)).toBeCloseTo(30, 6);
  });
  it("non-positive ΔT is invalid, not NaN", () => {
    expect(lmtd(0, 10)).toBeNull();
    expect(lmtd(-5, 10)).toBeNull();
  });
});

describe("effectiveness–NTU", () => {
  // Cr = 0.5, NTU = 2: counter = (1−e^−1)/(1−0.5e^−1) = 0.63212/0.81606 = 0.77459
  it("counterflow hand value", () => expect(epsCounter(2, 0.5)).toBeCloseTo(0.77459, 4));
  // parallel = (1−e^−3)/1.5 = 0.95021/1.5 = 0.63347
  it("parallel hand value", () => expect(epsParallel(2, 0.5)).toBeCloseTo(0.63347, 4));
  it("Cr = 1 counterflow: NTU/(1+NTU)", () => expect(epsCounter(1, 1)).toBeCloseTo(0.5, 12));
  it("Cr = 0: all arrangements → 1 − exp(−NTU)", () => {
    const e = 1 - Math.exp(-1.7);
    expect(epsCounter(1.7, 0)).toBeCloseTo(e, 12);
    expect(epsParallel(1.7, 0)).toBeCloseTo(e, 12);
    expect(epsShell1(1.7, 0)).toBeCloseTo(e, 12);
  });
  it("parallel flow cannot exceed 1/(1+Cr)", () => {
    expect(epsParallel(50, 0.5)).toBeLessThan(1 / 1.5 + 1e-9);
  });
  it("counter ≥ shell(1–2) ≥ parallel for same NTU, Cr", () => {
    for (const [n, cr] of [[0.5, 0.5], [2, 0.5], [3, 0.8], [1, 1]] as const) {
      expect(epsCounter(n, cr)).toBeGreaterThan(epsShell1(n, cr));
      expect(epsShell1(n, cr)).toBeGreaterThan(epsParallel(n, cr));
    }
  });
  it("ε–NTU and inverse round-trip (all configurations)", () => {
    for (const cr of [0, 0.3, 0.75, 1]) {
      expect(ntuCounter(epsCounter(1.8, cr), cr)).toBeCloseTo(1.8, 8);
      if (cr < 1) expect(ntuParallel(epsParallel(1.8, cr), cr)).toBeCloseTo(1.8, 8);
      expect(ntuShellN(epsShellN(1.8, cr, 1), cr, 1)).toBeCloseTo(1.8, 6);
      expect(ntuShellN(epsShellN(2.6, cr, 2), cr, 2)).toBeCloseTo(2.6, 6);
    }
  });
  it("two shells in series beat one shell at equal total NTU", () => {
    expect(epsShellN(3, 0.7, 2)).toBeGreaterThan(epsShellN(3, 0.7, 1));
  });
});

describe("correction factor F", () => {
  // R = 1, P = 0.5: F = (√2·0.5/0.5)/ln[(2−0.5(2−√2))/(2−0.5(2+√2))] = 1.4142/ln(5.8284) = 0.8023
  it("Bowman closed form matches hand calculation at R=1, P=0.5", () => {
    expect(bowmanF1(1, 0.5)).toBeCloseTo(0.8023, 3);
  });
  it("ε–NTU-derived F equals Bowman closed form for one shell pass (independent routes)", () => {
    for (const [R, P] of [[0.5, 0.4], [1, 0.5], [2, 0.3], [0.25, 0.7], [1.5, 0.35]] as const) {
      // Bowman definitions: R = (Th,in−Th,out)/(Tc,out−Tc,in) = Cc/Ch,  P = (Tc,out−Tc,in)/(Th,in−Tc,in)
      // Take Ch = 1, Cc = R; then ε = Q/(Cmin ΔTmax) = P·Cc/Cmin
      const Ch = 1;
      const Cc = R;
      const Cmin = Math.min(Ch, Cc);
      const Cr = Cmin / Math.max(Ch, Cc);
      // P = (Tc,out − Tc,in)/(Th,in − Tc,in) = eps·Cmin/Cc
      const eps = (P * Cc) / Cmin;
      expect(Cmin).toBeGreaterThan(0);
      if (eps >= 1) continue;
      const Fe = correctionFactor(eps, Cr, 1);
      const Fb = bowmanF1(R, P);
      expect(Fe).not.toBeNull();
      expect(Fe!).toBeCloseTo(Fb!, 6);
    }
  });
  it("F ≤ 1, and more shell passes raise F", () => {
    const f1 = correctionFactor(0.6, 0.8, 1)!;
    const f2 = correctionFactor(0.6, 0.8, 2)!;
    expect(f1).toBeLessThan(1);
    expect(f2).toBeGreaterThan(f1);
    expect(f2).toBeLessThanOrEqual(1);
  });
  it("infeasible effectiveness for a single shell returns null (temperature cross limit)", () => {
    expect(correctionFactor(0.95, 1, 1)).toBeNull();
  });
});

describe("convective correlations", () => {
  // Re=1e4, Pr=7: f=(0.79 ln1e4 −1.64)^−2=0.03148; Nu = (f/8)(Re−1000)Pr/(1+12.7√(f/8)(Pr^(2/3)−1)) ≈ 79.5
  it("Gnielinski hand value", () => expect(gnielinski(1e4, 7)).toBeCloseTo(79.5, 0));
  // 0.023·1e4^0.8·7^0.4 = 0.023·1584.9·2.178 = 79.40
  it("Dittus–Boelter hand value", () => expect(dittusBoelter(1e4, 7, true)).toBeCloseTo(79.4, 0));
  it("Hausen laminar → 3.66 for very long tubes", () => {
    expect(hausenLaminar(500, 7, 1e-6)).toBeCloseTo(3.66, 2);
  });
  it("auto selection: laminar uses Hausen, turbulent uses Gnielinski", () => {
    expect(nusseltInternal("auto", { Re: 1000, Pr: 7, DoverL: 0.01, heating: true }).correlation).toMatch(/Hausen/);
    expect(nusseltInternal("auto", { Re: 5e4, Pr: 7, DoverL: 0.01, heating: true }).correlation).toMatch(/Gnielinski/);
  });
  it("explicit Dittus–Boelter at Re = 5000 is flagged outside validity (not silently applied)", () => {
    const r = nusseltInternal("dittus-boelter", { Re: 5000, Pr: 7, DoverL: 0.01, heating: true });
    expect(r.inRange).toBe(false);
  });
  it("transitional band is flagged", () => {
    const r = nusseltInternal("auto", { Re: 2600, Pr: 7, DoverL: 0.01, heating: true });
    expect(r.inRange).toBe(false);
    expect(r.regime).toBe("transitional");
  });
  it("heating exponent 0.4 gives higher Nu than cooling 0.3 for Pr > 1", () => {
    expect(dittusBoelter(2e4, 5, true)).toBeGreaterThan(dittusBoelter(2e4, 5, false));
  });
});

describe("friction factor", () => {
  it("laminar f = 64/Re", () => expect(darcyFriction(1000, 0).f).toBeCloseTo(0.064, 10));
  // smooth Re=1e5: 1/√f = −1.8 log10(6.9/1e5) = 7.490 → f = 0.01783
  it("Haaland smooth pipe hand value", () => expect(haaland(1e5, 0)).toBeCloseTo(0.01783, 4));
  it("roughness raises f", () => expect(haaland(1e5, 0.005)).toBeGreaterThan(haaland(1e5, 0)));
  it("friction is continuous-ish across the transitional band", () => {
    const a = darcyFriction(2299, 1e-4).f;
    const b = darcyFriction(2301, 1e-4).f;
    const c = darcyFriction(3999, 1e-4).f;
    const d = darcyFriction(4001, 1e-4).f;
    expect(Math.abs(a - b)).toBeLessThan(1e-3);
    expect(Math.abs(c - d)).toBeLessThan(1e-3);
  });
});

describe("fluid properties", () => {
  it("water at 20 °C matches standard values; Pr ≈ 7.0", () => {
    const r = getFluidProperties({ fluidId: "water" }, 20, 1e5).props!;
    expect(r.rho).toBeCloseTo(998.2, 1);
    expect(r.cp).toBeCloseTo(4182, 0);
    expect(r.mu).toBeCloseTo(1.002e-3, 6);
    expect(r.k).toBeCloseTo(0.598, 3);
    expect(prandtl(r)).toBeCloseTo(7.0, 1);
  });
  it("interpolation is monotonic for water viscosity", () => {
    const a = getFluidProperties({ fluidId: "water" }, 35, 1e5).props!.mu;
    expect(a).toBeLessThan(getFluidProperties({ fluidId: "water" }, 30, 1e5).props!.mu);
    expect(a).toBeGreaterThan(getFluidProperties({ fluidId: "water" }, 40, 1e5).props!.mu);
  });
  it("out-of-range temperature is flagged and clamped", () => {
    const r = getFluidProperties({ fluidId: "water" }, 200, 1e5);
    expect(r.inRange).toBe(false);
    expect(r.props!.rho).toBe(917);
  });
  it("air density follows the ideal gas law", () => {
    const r = getFluidProperties({ fluidId: "air" }, 26.85, 101325).props!; // 300 K
    expect(r.rho).toBeCloseTo(101325 / (287.05 * 300), 6);
  });
  it("unknown fluid does not silently produce properties", () => {
    const r = getFluidProperties({ fluidId: "thermal-oil" }, 100, 1e5);
    expect(r.props).toBeNull();
    expect(r.error).toMatch(/manual/i);
  });
  it("manual properties must be positive", () => {
    expect(getFluidProperties({ manual: { rho: 900, cp: 2000, mu: 0, k: 0.1 } }, 50, 1e5).props).toBeNull();
  });
});

describe("geometry & resistance network", () => {
  it("do = di + 2t and Ao = π do L Nt", () => {
    expect(outsideDiameter(0.01575, 0.00165)).toBeCloseTo(0.01905, 10);
    expect(outsideArea(0.02, 2, 10)).toBeCloseTo(Math.PI * 0.02 * 2 * 10, 12);
  });
  it("Kern equivalent diameter, 1-in triangular pitch, 3/4-in tubes = 0.72 in (Kern's worked value)", () => {
    // 4(0.5·25.4·0.866·25.4 − π·19.05²/8)/(0.5π·19.05) = 4(279.4 − 142.5)/29.92 = 18.30 mm = 0.72 in
    expect(kernEquivalentDiameter(0.0254, 0.01905, "triangular")).toBeCloseTo(0.0183, 4);
  });
  it("U closes on the series network: Uo·Ao·Rtotal = 1 and clean ≥ dirty", () => {
    const g = sampleConfiguration.geometry;
    const n = resistanceNetwork(g, 4000, 3000, 1.76e-4, 1.76e-4);
    expect(n.Uo * n.Ao * n.Rtotal).toBeCloseTo(1, 12);
    expect(n.UoClean).toBeGreaterThan(n.Uo);
    const sum = n.Rconv_i + n.Rfoul_i + n.Rwall + n.Rfoul_o + n.Rconv_o;
    expect(sum).toBeCloseTo(n.Rtotal, 15);
    expect(n.normalised.total).toBeCloseTo(1 / n.Uo, 10);
  });
  it("zero fouling → dirty = clean", () => {
    const n = resistanceNetwork(sampleConfiguration.geometry, 4000, 3000, 0, 0);
    expect(n.Uo).toBeCloseTo(n.UoClean, 10);
  });
  it("effective fouling 1/Ud − 1/Uc: Uc=1000, Ud=800 → 2.5e-4", () => {
    expect(effectiveFouling(1000, 800)).toBeCloseTo(2.5e-4, 10);
    expect(effectiveFouling(800, 1000)).toBeNull();
  });
  it("pumping power: 100 kPa × 0.001 m³/s = 100 W hydraulic; η=0.5 → 200 W", () => {
    const p = pumpingPower(1e5, 1e-3, 0.5);
    expect(p.hydraulic).toBeCloseTo(100, 10);
    expect(p.electrical).toBeCloseTo(200, 10);
  });
});
