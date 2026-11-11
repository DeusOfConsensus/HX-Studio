/**
 * Core engineering types for HX Studio.
 *
 * INTERNAL UNIT SYSTEM (all engineering modules): SI
 *   temperature: °C (differences are identical to K; absolute K used where required)
 *   length: m, area: m², mass flow: kg/s, pressure: Pa (absolute),
 *   power: W, U: W/m²K, fouling: m²K/W, viscosity: Pa·s, conductivity: W/mK
 * Display-unit conversion lives in ./units/conversions.ts and is applied only at the UI boundary.
 */

export type ExchangerType = "shell-and-tube" | "double-pipe";
export type FlowArrangement = "parallel" | "counter";
export type TubeArrangement = "triangular" | "square";
export type StreamId = "hot" | "cold";
export type CorrelationChoice = "auto" | "dittus-boelter" | "sieder-tate" | "gnielinski";
export type SolveMode = "rating" | "duty";
export type DutySource = "hot" | "cold" | "specified";

export interface ManualProps {
  rho: number; // kg/m³
  cp: number; // J/kgK
  mu: number; // Pa·s
  k: number; // W/mK
}

export interface StreamInput {
  label: string;
  /** Library fluid id. Ignored for properties if `manual` is given. */
  fluidId?: string;
  /** Manual property entry. Evaluated as constant over the exchanger (flagged in results). */
  manual?: ManualProps;
  Tin: number; // °C
  /** Required in "duty" mode, must be undefined in "rating" mode. */
  Tout?: number; // °C
  mdot: number; // kg/s
  pressure: number; // Pa absolute (operating)
}

export interface GeometryInput {
  type: ExchangerType;
  /** Idealised flow arrangement. For multipass shell-and-tube it does not select parallel/counter. */
  flow: FlowArrangement;
  /** Which stream flows inside the tubes (inner pipe for double-pipe). */
  tubeSideStream: StreamId;
  di: number; // m, tube inside diameter
  t: number; // m, tube wall thickness (do = di + 2t)
  L: number; // m, straight tube length
  Nt: number; // total number of tubes (1 for double-pipe)
  pitch: number; // m, tube pitch (shell-and-tube)
  arrangement: TubeArrangement;
  /** Shell inside diameter (S&T) or outer-pipe inside diameter (double-pipe), m */
  Ds: number;
  tubePasses: number;
  shellPasses: number;
  baffleSpacing: number; // m
  baffleCut: number; // fraction of shell diameter, e.g. 0.25
  kw: number; // W/mK wall conductivity
  roughness: number; // m absolute tube roughness
}

export interface OperatingInput {
  pumpEfficiency: number; // 0..1 overall (hydraulic → electrical input)
  Rfi: number; // m²K/W, based on inside area
  Rfo: number; // m²K/W, based on outside area
  correlation: CorrelationChoice;
  /** If set, all fluid properties are evaluated at this temperature (°C); otherwise at stream mean bulk T. */
  propertyEvalTemp?: number;
  /** Velocity warning limits [min,max] m/s for liquids / gases (configurable). */
  velocityLimits: { liquidTube: [number, number]; liquidShell: [number, number]; gas: [number, number] };
  /** Maximum tolerated relative energy-balance discrepancy before warning */
  energyBalanceTolerance: number;
}

export interface ExchangerInput {
  mode: SolveMode;
  hot: StreamInput;
  cold: StreamInput;
  geometry: GeometryInput;
  operating: OperatingInput;
  dutySource: DutySource;
  specifiedQ?: number; // W, used when dutySource === "specified"
}

export type ParamStatus =
  | "calculated"
  | "warning"
  | "incomplete"
  | "invalid"
  | "out_of_range"
  | "unavailable";

export interface ParamResult {
  id: string;
  name: string;
  symbol: string;
  value: number | null;
  unit: string;
  status: ParamStatus;
  formula: string;
  inputs: string[];
  explanation: string;
  assumptions: string[];
  /** Extra named values (tube/shell side, components etc.) */
  details: Record<string, number | string | null>;
  notes: string[];
}

export interface Issue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  field?: string;
}
