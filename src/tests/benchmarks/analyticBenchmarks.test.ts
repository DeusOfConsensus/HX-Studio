import { describe, expect, it } from "vitest";
import { epsCounter, epsParallel } from "../../engineering/correlations/effectivenessNtu";
import { lmtd } from "../../engineering/calculations/lmtd";

/**
 * Fixed, equation-level reference cases for common heat-exchanger relations.
 * These check implementation regressions against analytic values; they are not empirical
 * validation of the full solver or of Kern/Bell–Delaware correlations.
 * Effectiveness relations follow the Kays & London / Incropera references noted in the
 * implementation. LMTD values are direct evaluations of the defining logarithmic-mean equation.
 */
describe("analytic engineering benchmarks", () => {
  it("matches the parallel-flow effectiveness reference at NTU 1.5 and Cr 0.5", () => {
    expect(epsParallel(1.5, 0.5)).toBeCloseTo(0.5964005169587571, 12);
  });

  it("matches the counterflow effectiveness reference at NTU 1.5 and Cr 0.5", () => {
    expect(epsCounter(1.5, 0.5)).toBeCloseTo(0.6907854082479168, 12);
  });

  it("uses the analytic counterflow equal-capacity limit", () => {
    expect(epsCounter(2, 1)).toBeCloseTo(2 / 3, 14);
  });

  it("matches the logarithmic mean for terminal differences of 80 K and 40 K", () => {
    expect(lmtd(80, 40)).toBeCloseTo(57.70780163555854, 12);
  });

  it("preserves energy balance for a fixed counterflow effectiveness case", () => {
    // Ch=2000 W/K, Cc=1000 W/K, NTU=UA/Cmin=1.5, inlet temperatures 100°C and 20°C.
    // Reference duty is ε*Cmin*(Th,in-Tc,in), with outlet temperatures from Q=Cp*ΔT.
    const dutyW = 55_262.83265983334;
    const hotOutletC = 72.36858367008332;
    const coldOutletC = 75.26283265983334;

    expect(2000 * (100 - hotOutletC)).toBeCloseTo(dutyW, 8);
    expect(1000 * (coldOutletC - 20)).toBeCloseTo(dutyW, 8);
    expect(epsCounter(1.5, 0.5) * 1000 * (100 - 20)).toBeCloseTo(dutyW, 8);
  });
});
