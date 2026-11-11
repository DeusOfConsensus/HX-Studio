/** Field-level (schema) validation with Zod. Cross-field engineering consistency is in engineeringChecks.ts. */
import { z } from "zod";
import type { ExchangerInput, Issue } from "../types";

const pos = z.number().finite().positive();
const nonNeg = z.number().finite().min(0);
const temp = z.number().finite().gt(-273.15, "Temperature must be above absolute zero");

const streamSchema = z.object({
  label: z.string(),
  fluidId: z.string().optional(),
  manual: z.object({ rho: pos, cp: pos, mu: pos, k: pos }).optional(),
  Tin: temp,
  Tout: temp.optional(),
  mdot: pos,
  pressure: pos,
});

const geometrySchema = z.object({
  type: z.enum(["shell-and-tube", "double-pipe"]),
  flow: z.enum(["parallel", "counter"]),
  tubeSideStream: z.enum(["hot", "cold"]),
  di: pos,
  t: pos,
  L: pos,
  Nt: z.number().int().min(1),
  pitch: pos,
  arrangement: z.enum(["triangular", "square"]),
  Ds: pos,
  tubePasses: z.number().int().min(1),
  shellPasses: z.number().int().min(1),
  baffleSpacing: pos,
  baffleCut: z.number().gt(0).lt(0.5),
  kw: pos,
  roughness: nonNeg,
});

const operatingSchema = z.object({
  pumpEfficiency: z.number().gt(0).lte(1),
  Rfi: nonNeg,
  Rfo: nonNeg,
  correlation: z.enum(["auto", "dittus-boelter", "sieder-tate", "gnielinski"]),
  propertyEvalTemp: temp.optional(),
  velocityLimits: z.object({
    liquidTube: z.tuple([pos, pos]),
    liquidShell: z.tuple([pos, pos]),
    gas: z.tuple([pos, pos]),
  }),
  energyBalanceTolerance: z.number().gt(0).lt(1),
});

export const exchangerSchema = z.object({
  mode: z.enum(["rating", "duty"]),
  hot: streamSchema,
  cold: streamSchema,
  geometry: geometrySchema,
  operating: operatingSchema,
  dutySource: z.enum(["hot", "cold", "specified"]),
  specifiedQ: pos.optional(),
});

export function validateSchema(input: unknown): Issue[] {
  const r = exchangerSchema.safeParse(input);
  if (r.success) return [];
  return r.error.issues.map((i) => ({
    severity: "error" as const,
    code: "SCHEMA",
    field: i.path.join("."),
    message: `${i.path.join(".") || "input"}: ${i.message}`,
  }));
}

export type ValidatedInput = ExchangerInput;
