/** Cross-field engineering consistency checks. Errors block calculation; warnings do not. */
import type { ExchangerInput, Issue } from "../types";

const err = (code: string, message: string, field?: string): Issue => ({ severity: "error", code, message, field });
const warn = (code: string, message: string, field?: string): Issue => ({ severity: "warning", code, message, field });

export function checkEngineering(input: ExchangerInput): Issue[] {
  const out: Issue[] = [];
  const { hot, cold, geometry: g, mode, operating: op } = input;
  const par = g.flow === "parallel";

  // ---------- temperatures
  if (hot.Tin <= cold.Tin) out.push(err("T_ORDER", "Hot inlet temperature must exceed cold inlet temperature.", "hot.Tin"));

  if (mode === "rating") {
    if (hot.Tout !== undefined || cold.Tout !== undefined) {
      out.push(warn("T_OUT_IGNORED", "Outlet temperatures are solved in rating mode; supplied values are ignored."));
    }
  } else {
    if (hot.Tout === undefined || cold.Tout === undefined) {
      out.push(err("T_OUT_MISSING", "Duty mode requires both hot and cold outlet temperatures.", "hot.Tout"));
    } else {
      if (hot.Tout >= hot.Tin) out.push(err("HOT_NOT_COOLED", "Hot stream outlet must be below its inlet.", "hot.Tout"));
      if (cold.Tout <= cold.Tin) out.push(err("COLD_NOT_HEATED", "Cold stream outlet must be above its inlet.", "cold.Tout"));
      if (hot.Tout <= cold.Tin) out.push(err("HOT_BELOW_COLD_IN", "Hot outlet cannot reach or fall below the cold inlet temperature.", "hot.Tout"));
      if (cold.Tout >= hot.Tin) out.push(err("COLD_ABOVE_HOT_IN", "Cold outlet cannot reach or exceed the hot inlet temperature.", "cold.Tout"));
      const cross = g.shellPasses === 1 && g.tubePasses === 1 && par ? hot.Tout <= cold.Tout : false;
      if (cross) out.push(err("PARALLEL_CROSS", "Parallel flow cannot have hot outlet at or below cold outlet (temperature cross is impossible).", "hot.Tout"));
    }
    if (input.dutySource === "specified" && input.specifiedQ === undefined) {
      out.push(err("Q_MISSING", "Specified duty source selected but no duty value provided.", "specifiedQ"));
    }
  }

  // ---------- geometry
  if (g.di <= 0 || g.t <= 0) out.push(err("WALL", "Tube inside diameter and wall thickness must be positive.", "geometry.t"));
  const dOut = g.di + 2 * g.t;
  if (g.t >= g.di) out.push(warn("THICK_WALL", "Wall thickness ≥ inside diameter: thin-wall assumptions may be unreliable."));

  if (g.type === "double-pipe") {
    if (g.Nt !== 1) out.push(warn("DP_NT", "Double-pipe exchanger uses a single inner tube; Nt is forced to 1."));
    if (g.Ds <= dOut) out.push(err("ANNULUS", "Outer pipe inside diameter must exceed the inner tube outside diameter.", "geometry.Ds"));
    if (g.tubePasses !== 1 || g.shellPasses !== 1) out.push(warn("DP_PASSES", "Double-pipe exchanger is single-pass; pass counts are forced to 1."));
  } else {
    if (g.pitch <= dOut) out.push(err("PITCH", "Tube pitch must exceed tube outside diameter.", "geometry.pitch"));
    else if (g.pitch < 1.25 * dOut) out.push(warn("PITCH_TIGHT", "Pitch/do < 1.25: below common TEMA practice (ligament strength, cleaning lanes)."));
    if (g.Ds <= dOut) out.push(err("SHELL", "Shell diameter must exceed tube outside diameter.", "geometry.Ds"));
    if (g.baffleSpacing > g.L) out.push(warn("BAFFLE_LONG", "Baffle spacing exceeds tube length: no baffles would fit."));
    if (g.baffleCut < 0.15 || g.baffleCut > 0.45) out.push(warn("BAFFLE_CUT", "Baffle cut outside the usual 15–45 % range."));
    if (g.tubePasses > 1 && g.tubePasses % 2 !== 0) {
      out.push(err("ODD_PASSES", "Only even numbers of tube passes are supported for multipass ε–NTU/F relations.", "geometry.tubePasses"));
    }
    if (g.shellPasses > 1 && g.tubePasses < 2) {
      out.push(err("SHELL_PASSES", "Multiple shell passes require at least 2 tube passes per shell in this model.", "geometry.tubePasses"));
    }
    if (g.Nt < g.tubePasses) out.push(err("PASS_TUBES", "Fewer tubes than tube passes.", "geometry.Nt"));
    // Approximate bundle-fit screen (area ratio, NOT a layout count)
    const cell = g.arrangement === "triangular" ? 0.866 * g.pitch * g.pitch : g.pitch * g.pitch;
    const bundleArea = (Math.PI / 4) * g.Ds * g.Ds;
    if (g.Nt * cell > 0.9 * bundleArea) {
      out.push(warn("BUNDLE_FIT", "Tube count may not fit in this shell diameter (approximate area screen; do a proper tube-count layout)."));
    }
  }

  // ---------- operating
  if (op.pumpEfficiency <= 0 || op.pumpEfficiency > 1) out.push(err("PUMP_EFF", "Pump efficiency must be in (0, 1].", "operating.pumpEfficiency"));
  return out;
}
