import type { ExchangerInput } from "./types";

/**
 * CLEARLY IDENTIFIED DEMONSTRATION CONFIGURATION — not a real design.
 * Water–water, 1 shell pass / 2 tube passes, 3/4" OD tubes (BWG 14: 19.05 mm OD, 1.65 mm wall)
 * on 1-in triangular pitch. Fouling values are in the range of typical treated-water TEMA values
 * and must be replaced for real work.
 */
export const SAMPLE_CONFIGURATION_LABEL = "SAMPLE — demonstration data, not a real design";

export const sampleConfiguration: ExchangerInput = {
  mode: "rating",
  dutySource: "hot",
  hot: { label: "Hot water (shell side)", fluidId: "water", Tin: 85, mdot: 2.0, pressure: 3e5 },
  cold: { label: "Cooling water (tube side)", fluidId: "water", Tin: 25, mdot: 3.0, pressure: 3e5 },
  geometry: {
    type: "shell-and-tube",
    flow: "counter",
    tubeSideStream: "cold",
    di: 0.01575,
    t: 0.00165,
    L: 2.44,
    Nt: 32, // fits the 203 mm shell (lattice capacity 37); Kern tube-count table lists 30 for 2 passes
    pitch: 0.0254,
    arrangement: "triangular",
    Ds: 0.203,
    tubePasses: 2,
    shellPasses: 1,
    baffleSpacing: 0.1,
    baffleCut: 0.25,
    kw: 16,
    roughness: 4.6e-5,
  },
  operating: {
    pumpEfficiency: 0.65,
    Rfi: 1.76e-4,
    Rfo: 1.76e-4,
    correlation: "auto",
    velocityLimits: { liquidTube: [0.9, 3.0], liquidShell: [0.3, 1.5], gas: [3, 30] },
    energyBalanceTolerance: 0.05,
  },
};

export const sampleDoublePipe: ExchangerInput = {
  ...sampleConfiguration,
  hot: { label: "Hot water (annulus)", fluidId: "water", Tin: 80, mdot: 0.5, pressure: 3e5 },
  cold: { label: "Cold water (inner tube)", fluidId: "water", Tin: 20, mdot: 0.4, pressure: 3e5 },
  geometry: {
    ...sampleConfiguration.geometry,
    type: "double-pipe",
    flow: "counter",
    tubeSideStream: "cold",
    di: 0.0221,
    t: 0.0028,
    L: 5,
    Nt: 1,
    Ds: 0.0525,
    tubePasses: 1,
    shellPasses: 1,
  },
};
