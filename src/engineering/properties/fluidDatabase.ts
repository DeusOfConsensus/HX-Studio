/**
 * Local fluid property library.
 *
 * Only fluids with documented tabulated/correlated data are included. Propylene glycol, thermal oils
 * and steam are intentionally NOT included: no validated dataset is bundled, so those must be
 * entered manually (ManualProps). Nothing is silently invented.
 *
 * Sources (textbook tabulations; values should be re-verified against the cited tables before
 * use in any safety- or cost-critical design):
 *  - Water: saturated liquid, standard steam-table values, 0–150 °C (pressure effect on liquid
 *    properties neglected; liquid must remain liquid at operating pressure — checked by caller).
 *  - Air: Incropera Table A.4 (mu, k, cp) with ideal-gas density at operating pressure, 250–600 K.
 *  - Ethylene glycol (pure): Incropera Table A.5, 273–373 K.
 */
import { interpolateTable, type TableRow } from "./propertyInterpolation";
import type { ManualProps } from "../types";

export interface FluidProps extends ManualProps {}

export interface FluidDef {
  id: string;
  name: string;
  phase: "liquid" | "gas";
  /** Validity range °C */
  range: [number, number];
  source: string;
  evaluate: (T: number, P: number) => { props: FluidProps; inRange: boolean };
}

const WATER: TableRow[] = [
  { T: 0, rho: 999.8, cp: 4217, mu: 1.792e-3, k: 0.561 },
  { T: 10, rho: 999.7, cp: 4192, mu: 1.306e-3, k: 0.58 },
  { T: 20, rho: 998.2, cp: 4182, mu: 1.002e-3, k: 0.598 },
  { T: 30, rho: 995.7, cp: 4178, mu: 7.97e-4, k: 0.615 },
  { T: 40, rho: 992.2, cp: 4179, mu: 6.53e-4, k: 0.631 },
  { T: 50, rho: 988.0, cp: 4181, mu: 5.47e-4, k: 0.644 },
  { T: 60, rho: 983.2, cp: 4185, mu: 4.66e-4, k: 0.654 },
  { T: 70, rho: 977.8, cp: 4190, mu: 4.04e-4, k: 0.663 },
  { T: 80, rho: 971.8, cp: 4197, mu: 3.54e-4, k: 0.67 },
  { T: 90, rho: 965.3, cp: 4205, mu: 3.15e-4, k: 0.676 },
  { T: 100, rho: 958.4, cp: 4216, mu: 2.82e-4, k: 0.679 },
  { T: 120, rho: 943.1, cp: 4244, mu: 2.32e-4, k: 0.683 },
  { T: 150, rho: 917.0, cp: 4310, mu: 1.82e-4, k: 0.682 },
];

// Incropera Table A.5, ethylene glycol, T given in K → converted to °C
const EG: TableRow[] = (
  [
    [273, 1130.8, 2294, 6.51e-2, 0.242],
    [280, 1125.8, 2323, 4.2e-2, 0.244],
    [290, 1118.8, 2368, 2.47e-2, 0.248],
    [300, 1114.4, 2415, 1.57e-2, 0.252],
    [310, 1103.7, 2460, 1.07e-2, 0.255],
    [320, 1096.2, 2505, 7.57e-3, 0.258],
    [330, 1089.5, 2549, 5.61e-3, 0.26],
    [340, 1083.8, 2592, 4.31e-3, 0.261],
    [350, 1079.0, 2637, 3.42e-3, 0.261],
    [360, 1074.0, 2682, 2.78e-3, 0.261],
    [370, 1066.7, 2728, 2.28e-3, 0.262],
    [373, 1058.5, 2742, 2.15e-3, 0.263],
  ] as const
).map(([K, rho, cp, mu, k]) => ({ T: K - 273.15, rho, cp, mu, k }));

// Incropera Table A.4, air at 1 atm: mu [Pa·s], k [W/mK], cp [J/kgK]
const AIR: TableRow[] = (
  [
    [250, 1006, 159.6e-7, 22.3e-3],
    [300, 1007, 184.6e-7, 26.3e-3],
    [350, 1009, 208.2e-7, 30.0e-3],
    [400, 1014, 230.1e-7, 33.8e-3],
    [450, 1021, 250.7e-7, 37.3e-3],
    [500, 1030, 270.1e-7, 40.7e-3],
    [600, 1051, 305.8e-7, 46.9e-3],
  ] as const
).map(([K, cp, mu, k]) => ({ T: K - 273.15, cp, mu, k }));

const R_AIR = 287.05; // J/kgK

export const FLUIDS: Record<string, FluidDef> = {
  water: {
    id: "water",
    name: "Water (liquid)",
    phase: "liquid",
    range: [0, 150],
    source: "Steam-table saturated liquid values, tabulated; density/cp/k linear, viscosity log-linear interpolation",
    evaluate: (T) => {
      const r = interpolateTable(WATER, T);
      return { props: { rho: r.rho!, cp: r.cp, mu: r.mu, k: r.k }, inRange: r.inRange };
    },
  },
  "ethylene-glycol": {
    id: "ethylene-glycol",
    name: "Ethylene glycol (pure)",
    phase: "liquid",
    range: [273 - 273.15, 373 - 273.15],
    source: "Incropera Table A.5; density/cp/k linear, viscosity log-linear interpolation",
    evaluate: (T) => {
      const r = interpolateTable(EG, T);
      return { props: { rho: r.rho!, cp: r.cp, mu: r.mu, k: r.k }, inRange: r.inRange };
    },
  },
  air: {
    id: "air",
    name: "Air (ideal gas)",
    phase: "gas",
    range: [250 - 273.15, 600 - 273.15],
    source: "Incropera Table A.4 (cp, mu, k) with ideal-gas density rho = P/(R·T), R = 287.05 J/kgK",
    evaluate: (T, P) => {
      const r = interpolateTable(AIR, T);
      const Tc = Math.min(Math.max(T, -273.15 + 1), 5000);
      return {
        props: { rho: P / (R_AIR * (Tc + 273.15)), cp: r.cp, mu: r.mu, k: r.k },
        inRange: r.inRange,
      };
    },
  },
};

/** Fluids deliberately absent from the library; UI should offer manual entry for these. */
export const MANUAL_ONLY_FLUIDS = ["Propylene glycol", "Thermal oil", "Steam / wet vapour"];

export interface PropertyLookup {
  props: FluidProps | null;
  phase: "liquid" | "gas" | "manual";
  inRange: boolean;
  source: string;
  error?: string;
}

export function getFluidProperties(
  stream: { fluidId?: string; manual?: ManualProps },
  T: number,
  P: number,
): PropertyLookup {
  if (stream.manual) {
    const m = stream.manual;
    const bad = [m.rho, m.cp, m.mu, m.k].some((x) => !Number.isFinite(x) || x <= 0);
    if (bad) {
      return { props: null, phase: "manual", inRange: false, source: "manual", error: "Manual properties must all be positive finite numbers." };
    }
    return { props: m, phase: "manual", inRange: true, source: "Manual entry (treated as constant over the exchanger)" };
  }
  const def = stream.fluidId ? FLUIDS[stream.fluidId] : undefined;
  if (!def) {
    return {
      props: null,
      phase: "manual",
      inRange: false,
      source: "none",
      error: stream.fluidId
        ? `Fluid "${stream.fluidId}" is not in the property library; enter properties manually.`
        : "No fluid selected and no manual properties supplied.",
    };
  }
  const r = def.evaluate(T, P);
  return { props: r.props, phase: def.phase, inRange: r.inRange, source: def.source };
}
