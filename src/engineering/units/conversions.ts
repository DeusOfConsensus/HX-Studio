/**
 * Unit conversion. All physical calculations run in SI (see types.ts); these helpers are for
 * display/input only. Absolute temperatures and temperature DIFFERENCES are separate functions
 * because they convert differently (offset vs. scale only).
 */

export type UnitCategory =
  | "temperature"
  | "pressure"
  | "power"
  | "energy"
  | "massFlow"
  | "volFlow"
  | "length"
  | "htc"
  | "fouling";

interface Linear {
  /** value_SI = value * factor */
  factor: number;
}

const LINEAR: Record<Exclude<UnitCategory, "temperature">, Record<string, Linear>> = {
  pressure: { Pa: { factor: 1 }, kPa: { factor: 1e3 }, bar: { factor: 1e5 }, psi: { factor: 6894.757293168 } },
  power: { W: { factor: 1 }, kW: { factor: 1e3 } },
  energy: { J: { factor: 1 }, kJ: { factor: 1e3 } },
  massFlow: { "kg/s": { factor: 1 }, "kg/h": { factor: 1 / 3600 }, "lb/h": { factor: 0.45359237 / 3600 } },
  volFlow: { "m3/s": { factor: 1 }, "m3/h": { factor: 1 / 3600 } },
  length: { m: { factor: 1 }, mm: { factor: 1e-3 }, in: { factor: 0.0254 }, ft: { factor: 0.3048 } },
  // 1 BTU/(h·ft²·°F) = 5.678263 W/m²K
  htc: { "W/m2K": { factor: 1 }, "BTU/h-ft2-F": { factor: 5.678263340863 } },
  // 1 h·ft²·°F/BTU = 0.1761102 m²K/W
  fouling: { "m2K/W": { factor: 1 }, "h-ft2-F/BTU": { factor: 1 / 5.678263340863 } },
};

export const UNITS: Record<UnitCategory, string[]> = {
  temperature: ["°C", "K", "°F"],
  pressure: Object.keys(LINEAR.pressure),
  power: Object.keys(LINEAR.power),
  energy: Object.keys(LINEAR.energy),
  massFlow: Object.keys(LINEAR.massFlow),
  volFlow: Object.keys(LINEAR.volFlow),
  length: Object.keys(LINEAR.length),
  htc: Object.keys(LINEAR.htc),
  fouling: Object.keys(LINEAR.fouling),
};

export function toCelsius(v: number, unit: string): number {
  switch (unit) {
    case "°C":
      return v;
    case "K":
      return v - 273.15;
    case "°F":
      return ((v - 32) * 5) / 9;
    default:
      throw new Error(`Unknown temperature unit: ${unit}`);
  }
}

export function fromCelsius(c: number, unit: string): number {
  switch (unit) {
    case "°C":
      return c;
    case "K":
      return c + 273.15;
    case "°F":
      return (c * 9) / 5 + 32;
    default:
      throw new Error(`Unknown temperature unit: ${unit}`);
  }
}

/** Convert a temperature DIFFERENCE (no offset). */
export function convertTempDelta(dv: number, from: string, to: string): number {
  const scale = (u: string) => {
    if (u === "°C" || u === "K") return 1;
    if (u === "°F") return 5 / 9; // 1 °F delta = 5/9 K
    throw new Error(`Unknown temperature unit: ${u}`);
  };
  return (dv * scale(from)) / scale(to);
}

export function toSI(value: number, category: UnitCategory, unit: string): number {
  if (category === "temperature") return toCelsius(value, unit);
  const u = LINEAR[category][unit];
  if (!u) throw new Error(`Unknown ${category} unit: ${unit}`);
  return value * u.factor;
}

export function fromSI(value: number, category: UnitCategory, unit: string): number {
  if (category === "temperature") return fromCelsius(value, unit);
  const u = LINEAR[category][unit];
  if (!u) throw new Error(`Unknown ${category} unit: ${unit}`);
  return value / u.factor;
}

export function convert(value: number, category: UnitCategory, from: string, to: string): number {
  return fromSI(toSI(value, category, from), category, to);
}

export const celsiusToKelvin = (c: number) => c + 273.15;
