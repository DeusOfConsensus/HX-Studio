/**
 * Main solver: assembles the 15 engineering parameters from an ExchangerInput.
 *
 * rating mode : geometry + inlets known → outlets solved with ε–NTU, properties iterated to the
 *               mean bulk temperatures.
 * duty mode   : both outlets specified → duty, LMTD/F, U, required vs available area.
 */
import type {
  ExchangerInput,
  GeometryInput,
  Issue,
  ManualProps,
  ParamResult,
  ParamStatus,
  StreamInput,
} from "../../engineering/types";
import { getFluidProperties } from "../../engineering/properties/fluidDatabase";
import { validateSchema } from "../../engineering/validation/inputValidation";
import { checkEngineering } from "../../engineering/validation/engineeringChecks";
import {
  epsCounter,
  epsParallel,
  epsShellN,
  ntuCounter,
  ntuParallel,
  ntuShellN,
} from "../../engineering/correlations/effectivenessNtu";
import { nusseltInternal } from "../../engineering/correlations/tubeSide";
import { kernNusselt } from "../../engineering/correlations/shellSide";
import { computeLmtd, multipassF } from "../../engineering/calculations/lmtd";
import {
  dOut,
  pumpingPower,
  shellSideHydraulics,
  tubeSideHydraulics,
  type SideHydraulics,
} from "../../engineering/calculations/hydraulics";
import {
  areas,
  prandtl,
  resistanceNetwork,
  totalFoulingOutside,
  type ResistanceNetwork,
} from "../../engineering/calculations/overallCoefficient";
import { temperatureProfile, type TemperatureProfile } from "../temperatureProfiles/profile";

export interface Evaluation {
  ok: boolean;
  issues: Issue[];
  parameters: ParamResult[];
  profile: TemperatureProfile | null;
  state: SolvedState | null;
}

export interface SolvedState {
  ThIn: number;
  ThOut: number;
  TcIn: number;
  TcOut: number;
  Ch: number;
  Cc: number;
  Cmin: number;
  Cr: number;
  Q: number;
  Qh: number;
  Qc: number;
  Qmax: number;
  eps: number;
  ntuAvailable: number;
  net: ResistanceNetwork;
  tube: SideHydraulics;
  shell: SideHydraulics;
  hTube: number;
  hShell: number;
  NuTube: ReturnType<typeof nusseltInternal>;
  NuShell: { Nu: number; correlation: string; validity: string; inRange: boolean; notes: string[] };
  propsHot: ManualProps;
  propsCold: ManualProps;
  TevalHot: number;
  TevalCold: number;
  config: "parallel" | "counter" | "shell-multipass";
  lmtdUncorrected: number | null;
  lmtdInfo: { dT1: number; dT2: number; formula: string } | null;
  F: number | null;
  areaRequired: number | null;
  iterations: number;
  warnings: Issue[];
}

const warn = (code: string, message: string): Issue => ({ severity: "warning", code, message });

export function effectiveGeometry(g: GeometryInput): GeometryInput {
  if (g.type === "double-pipe") return { ...g, Nt: 1, tubePasses: 1, shellPasses: 1 };
  return g;
}

function configOf(g: GeometryInput): SolvedState["config"] {
  if (g.type === "shell-and-tube" && g.tubePasses > 1) return "shell-multipass";
  return g.flow;
}

function epsFor(config: SolvedState["config"], ntu: number, cr: number, shellPasses: number): number {
  if (config === "parallel") return epsParallel(ntu, cr);
  if (config === "counter") return epsCounter(ntu, cr);
  return epsShellN(ntu, cr, shellPasses);
}

function lookup(stream: StreamInput, T: number, issues: Issue[], label: string) {
  const r = getFluidProperties(stream, T, stream.pressure);
  if (!r.props) {
    issues.push({ severity: "error", code: "PROPS", message: `${label}: ${r.error}` });
    return null;
  }
  if (!r.inRange) issues.push(warn("PROPS_RANGE", `${label}: temperature ${T.toFixed(1)} °C is outside the property table range; end values were used.`));
  if (r.phase === "manual") issues.push(warn("PROPS_MANUAL", `${label}: manual properties are treated as constant over the whole temperature range.`));
  return { props: r.props, phase: r.phase };
}

function convective(
  g: GeometryInput,
  op: ExchangerInput["operating"],
  tubeP: ManualProps,
  shellP: ManualProps,
  tubeMdot: number,
  shellMdot: number,
  tubeHeating: boolean,
  shellHeating: boolean,
) {
  const tube = tubeSideHydraulics(g, tubeMdot, tubeP);
  const shell = shellSideHydraulics(g, shellMdot, shellP);
  const Np = g.type === "double-pipe" ? 1 : g.tubePasses;
  const PrT = prandtl(tubeP);
  const NuTube = nusseltInternal(op.correlation, {
    Re: tube.Re,
    Pr: PrT,
    DoverL: g.di / (g.L * Np),
    heating: tubeHeating,
  });
  const hTube = (NuTube.Nu * tubeP.k) / tube.Dh;
  const PrS = prandtl(shellP);
  let NuShell: SolvedState["NuShell"];
  if (g.type === "double-pipe") {
    const r = nusseltInternal(op.correlation, { Re: shell.Re, Pr: PrS, DoverL: shell.Dh / g.L, heating: shellHeating });
    NuShell = { Nu: r.Nu, correlation: `${r.correlation} (annulus, Dh = D₂ − D₁)`, validity: r.validity, inRange: r.inRange, notes: r.notes };
  } else {
    NuShell = kernNusselt(shell.Re, PrS);
  }
  const hShell = (NuShell.Nu * shellP.k) / shell.Dh;
  return { tube, shell, NuTube, NuShell, hTube, hShell };
}

export function solve(rawInput: ExchangerInput): { state: SolvedState | null; issues: Issue[]; tubeHot: boolean } {
  const issues: Issue[] = [...validateSchema(rawInput)];
  if (issues.some((i) => i.severity === "error")) return { state: null, issues, tubeHot: false };
  const input: ExchangerInput = { ...rawInput, geometry: effectiveGeometry(rawInput.geometry) };
  issues.push(...checkEngineering(rawInput));
  if (issues.some((i) => i.severity === "error")) return { state: null, issues, tubeHot: false };

  const g = input.geometry;
  const op = input.operating;
  const tubeHot = g.tubeSideStream === "hot";
  const tubeStream = tubeHot ? input.hot : input.cold;
  const shellStream = tubeHot ? input.cold : input.hot;
  const config = configOf(g);
  const { Ao } = areas(g);

  const evalT = (a: number, b: number) => op.propertyEvalTemp ?? (a + b) / 2;

  let ThOut: number;
  let TcOut: number;
  const duty = input.mode === "duty";
  if (duty) {
    ThOut = input.hot.Tout!;
    TcOut = input.cold.Tout!;
  } else {
    const dTmax = input.hot.Tin - input.cold.Tin;
    ThOut = input.hot.Tin - 0.25 * dTmax;
    TcOut = input.cold.Tin + 0.25 * dTmax;
  }

  const localIssues: Issue[] = [];
  let iter = 0;
  let last: ReturnType<typeof buildOnce> | null = null;

  function buildOnce(tho: number, tco: number) {
    const tmpIssues: Issue[] = [];
    const Th = evalT(input.hot.Tin, tho);
    const Tc = evalT(input.cold.Tin, tco);
    const lh = lookup(input.hot, Th, tmpIssues, "Hot stream");
    const lc = lookup(input.cold, Tc, tmpIssues, "Cold stream");
    if (!lh || !lc) return { fail: tmpIssues } as const;
    const propsHot = lh.props;
    const propsCold = lc.props;
    const tubeP = tubeHot ? propsHot : propsCold;
    const shellP = tubeHot ? propsCold : propsHot;
    const c = convective(g, op, tubeP, shellP, tubeStream.mdot, shellStream.mdot, !tubeHot, tubeHot);
    const hInside = c.hTube;
    const hOutside = c.hShell;
    const net = resistanceNetwork(g, hInside, hOutside, op.Rfi, op.Rfo);
    const Ch = input.hot.mdot * propsHot.cp;
    const Cc = input.cold.mdot * propsCold.cp;
    const Cmin = Math.min(Ch, Cc);
    const Cmax = Math.max(Ch, Cc);
    const Cr = Cmin / Cmax;
    const ntu = net.UAo / Cmin;
    return { fail: null, Th, Tc, propsHot, propsCold, c, net, Ch, Cc, Cmin, Cr, ntu, tmpIssues, phases: [lh.phase, lc.phase] } as const;
  }

  let converged = false;
  for (iter = 1; iter <= 100; iter++) {
    const b = buildOnce(ThOut, TcOut);
    if (b.fail) {
      issues.push(...b.fail);
      return { state: null, issues, tubeHot };
    }
    last = b;
    if (duty) {
      converged = true;
      break;
    }
    const eps = epsFor(config, b.ntu, b.Cr, g.shellPasses);
    const Q = eps * b.Cmin * (input.hot.Tin - input.cold.Tin);
    const newTho = input.hot.Tin - Q / b.Ch;
    const newTco = input.cold.Tin + Q / b.Cc;
    const err = Math.max(Math.abs(newTho - ThOut), Math.abs(newTco - TcOut));
    ThOut = 0.5 * ThOut + 0.5 * newTho;
    TcOut = 0.5 * TcOut + 0.5 * newTco;
    if (err < 1e-7) {
      converged = true;
      ThOut = newTho;
      TcOut = newTco;
      last = buildOnce(ThOut, TcOut) as typeof b;
      break;
    }
  }
  if (!last || last.fail) return { state: null, issues, tubeHot };
  if (!converged) localIssues.push(warn("NOT_CONVERGED", "Property/outlet iteration did not converge within 100 iterations; results are approximate."));
  localIssues.push(...last.tmpIssues);

  const b = last;
  const { Ch, Cc, Cmin, Cr } = b;
  const Qh = Ch * (input.hot.Tin - ThOut);
  const Qc = Cc * (TcOut - input.cold.Tin);
  let Q: number;
  if (duty) {
    Q = input.dutySource === "hot" ? Qh : input.dutySource === "cold" ? Qc : input.specifiedQ!;
  } else {
    Q = Qh; // identical to Qc by construction in rating mode
  }
  const Qmax = Cmin * (input.hot.Tin - input.cold.Tin);
  const eps = Q / Qmax;

  // ---- LMTD and F
  const multipass = config === "shell-multipass";
  const lmtdFlow = multipass ? "counter" : g.flow;
  const li = computeLmtd(lmtdFlow, input.hot.Tin, ThOut, input.cold.Tin, TcOut);
  let F: number | null = 1;
  if (multipass) {
    F = multipassF(input.hot.Tin, ThOut, input.cold.Tin, TcOut, Q / (input.hot.Tin - ThOut), Q / (TcOut - input.cold.Tin), g.shellPasses);
    if (F === null) {
      localIssues.push({ severity: "error", code: "F_INFEASIBLE", message: "Specified terminal temperatures are not achievable in this multipass configuration (temperature cross beyond what the shell passes allow)." });
    } else if (F < 0.75) {
      localIssues.push(warn("F_LOW", `Correction factor F = ${F.toFixed(3)} < 0.75: configuration is thermally inefficient; consider more shell passes or true counterflow.`));
    }
  }
  const lmtdVal = li?.lmtd ?? null;
  if (li === null) localIssues.push({ severity: "error", code: "LMTD_INVALID", message: "Terminal temperature differences are not both positive; LMTD is undefined." });
  const areaReq = lmtdVal !== null && F !== null && b.net.Uo > 0 ? Q / (b.net.Uo * F * lmtdVal) : null;

  // energy balance
  const disc = Math.abs(Qh - Qc) / Math.max(Math.abs(Qh), Math.abs(Qc));
  if (duty && disc > op.energyBalanceTolerance) {
    localIssues.push(warn("ENERGY_BALANCE", `Hot- and cold-side duties differ by ${(disc * 100).toFixed(1)} % (tolerance ${(op.energyBalanceTolerance * 100).toFixed(1)} %). Duty source: ${input.dutySource}.`));
  }
  void Ao;

  const state: SolvedState = {
    ThIn: input.hot.Tin,
    ThOut,
    TcIn: input.cold.Tin,
    TcOut,
    Ch,
    Cc,
    Cmin,
    Cr,
    Q,
    Qh,
    Qc,
    Qmax,
    eps,
    ntuAvailable: b.ntu,
    net: b.net,
    tube: b.c.tube,
    shell: b.c.shell,
    hTube: b.c.hTube,
    hShell: b.c.hShell,
    NuTube: b.c.NuTube,
    NuShell: b.c.NuShell,
    propsHot: b.propsHot,
    propsCold: b.propsCold,
    TevalHot: b.Th,
    TevalCold: b.Tc,
    config,
    lmtdUncorrected: lmtdVal,
    lmtdInfo: li ? { dT1: li.dT1, dT2: li.dT2, formula: li.formula } : null,
    F,
    areaRequired: areaReq,
    iterations: iter,
    warnings: localIssues,
  };
  issues.push(...localIssues);
  return { state, issues, tubeHot };
}

// ---------------------------------------------------------------------------------------------

const fmtPct = (x: number) => `${(x * 100).toFixed(1)} %`;

function mk(
  id: string,
  name: string,
  symbol: string,
  unit: string,
  value: number | null,
  formula: string,
  inputs: string[],
  explanation: string,
  assumptions: string[],
  details: ParamResult["details"] = {},
  notes: string[] = [],
  status?: ParamStatus,
): ParamResult {
  let st: ParamStatus = status ?? "calculated";
  if (value === null || !Number.isFinite(value)) {
    st = status ?? "unavailable";
    value = null;
  } else if (!status && notes.length) st = "warning";
  return { id, name, symbol, value, unit, status: st, formula, inputs, explanation, assumptions, details, notes };
}

export function unavailableParameters(reason: string): ParamResult[] {
  const names: Array<[string, string, string, string]> = [
    ["Q", "Heat transfer rate", "Q", "W"],
    ["LMTD", "Log-mean temperature difference", "LMTD", "K"],
    ["U", "Overall heat-transfer coefficient", "Uo", "W/m²K"],
    ["A", "Required heat-transfer area", "A", "m²"],
    ["Re", "Reynolds number", "Re", "–"],
    ["Nu", "Nusselt number", "Nu", "–"],
    ["Pr", "Prandtl number", "Pr", "–"],
    ["dP", "Pressure drop", "ΔP", "Pa"],
    ["v", "Fluid velocity", "v", "m/s"],
    ["eps", "Effectiveness", "ε", "–"],
    ["NTU", "Number of transfer units", "NTU", "–"],
    ["Rf", "Fouling resistance", "Rf", "m²K/W"],
    ["Wpump", "Pumping power", "Wpump", "W"],
    ["Rth", "Thermal resistance", "Rth", "K/W"],
    ["geom", "Tube diameter and length", "do", "m"],
  ];
  return names.map(([id, name, symbol, unit]) => mk(id, name, symbol, unit, null, "", [], reason, [], {}, [reason], "invalid"));
}

export function evaluate(input: ExchangerInput): Evaluation {
  const { state, issues, tubeHot } = solve(input);
  if (!state) {
    const msg = issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ") || "Calculation unavailable.";
    return { ok: false, issues, parameters: unavailableParameters(msg), profile: null, state: null };
  }
  const s = state;
  const g = effectiveGeometry(input.geometry);
  const op = input.operating;
  const tubeP = tubeHot ? s.propsHot : s.propsCold;
  const shellP = tubeHot ? s.propsCold : s.propsHot;
  const d0 = dOut(g);
  const hasErr = issues.some((i) => i.severity === "error");
  const tubeLabel = tubeHot ? "hot (tube side)" : "cold (tube side)";
  const shellLabel = tubeHot ? "cold (shell/annulus side)" : "hot (shell/annulus side)";
  const flowLabel = s.config === "shell-multipass" ? `${g.shellPasses} shell / ${g.tubePasses} tube passes` : s.config;

  const warnsFor = (...codes: string[]) => issues.filter((i) => codes.includes(i.code)).map((i) => i.message);

  const P: ParamResult[] = [];

  // 1 Q
  const disc = Math.abs(s.Qh - s.Qc) / Math.max(Math.abs(s.Qh), Math.abs(s.Qc));
  P.push(
    mk("Q", "Heat transfer rate", "Q", "W", s.Q,
      "Qh = ṁh·Cph·(Th,in − Th,out); Qc = ṁc·Cpc·(Tc,out − Tc,in)",
      ["ṁh, Cph, Th,in, Th,out", "ṁc, Cpc, Tc,in, Tc,out"],
      input.mode === "rating"
        ? "Rating mode: outlets are solved from ε–NTU, so the hot- and cold-side balances agree by construction. Q = ε·Cmin·(Th,in − Tc,in)."
        : `Duty mode: Q taken from the ${input.dutySource} side. The two balances are compared and the discrepancy is reported, never silently equalised.`,
      ["Specific heats evaluated at stream mean bulk temperature (or the user evaluation temperature)."],
      { Qh: s.Qh, Qc: s.Qc, discrepancyPct: input.mode === "duty" ? disc * 100 : 0, source: input.mode === "rating" ? "ε–NTU" : input.dutySource,
        ThOut: s.ThOut, TcOut: s.TcOut },
      warnsFor("ENERGY_BALANCE", "NOT_CONVERGED")),
  );

  // 2 LMTD
  const dTm = s.lmtdUncorrected !== null && s.F !== null ? s.F * s.lmtdUncorrected : null;
  P.push(
    mk("LMTD", "Log-mean temperature difference", "LMTD", "K", s.lmtdUncorrected,
      s.lmtdInfo?.formula ?? "LMTD = (ΔT₁ − ΔT₂)/ln(ΔT₁/ΔT₂);  ΔTm = F·LMTD",
      ["Th,in, Th,out, Tc,in, Tc,out", "flow arrangement"],
      s.config === "shell-multipass"
        ? "Multipass shell-and-tube: LMTD is the COUNTERFLOW value for the terminal temperatures; the correction factor F (from ε–NTU, exact for 1–2n passes in each shell) gives ΔTm = F·LMTD."
        : "Single-pass unit: terminal differences follow the selected flow arrangement; F = 1.",
      ["Equal terminal differences use the limiting value LMTD = ΔT₁."],
      { dT1: s.lmtdInfo?.dT1 ?? null, dT2: s.lmtdInfo?.dT2 ?? null, F: s.F, correctedDeltaTm: dTm, configuration: flowLabel },
      warnsFor("F_LOW", "LMTD_INVALID", "F_INFEASIBLE"),
      s.lmtdUncorrected === null || s.F === null ? "invalid" : undefined),
  );

  // 3 U
  P.push(
    mk("U", "Overall heat-transfer coefficient", "Uo", "W/m²K", s.net.Uo,
      "1/(Uo·Ao) = 1/(hi·Ai) + Rfi/Ai + ln(do/di)/(2π·kw·L·Nt) + Rfo/Ao + 1/(ho·Ao)",
      ["hi, ho (from Nu correlations)", "Rfi, Rfo", "kw, di, do, L, Nt"],
      "Series thermal-resistance network on an outside-area basis. Dirty value includes fouling; clean value excludes it.",
      ["Thin-film convection only; no wall-temperature viscosity correction."],
      { UoClean: s.net.UoClean, UoDirty: s.net.Uo, hTube: s.hTube, hShell: s.hShell, hInside: s.hTube, hOutside: s.hShell },
      warnsFor("PROPS_RANGE", "PROPS_MANUAL")),
  );

  // 4 A
  const margin = s.areaRequired !== null ? s.net.Ao - s.areaRequired : null;
  P.push(
    mk("A", "Required heat-transfer area", "A", "m²", s.areaRequired,
      "A = Q/(Uo·F·LMTD);  Ao = π·do·L·Nt",
      ["Q", "Uo", "F", "LMTD", "do, L, Nt"],
      "Required outside area compared with the area the geometry provides. Adequacy > 100 % means the exchanger has spare area.",
      ["Uo is the dirty value (includes specified fouling)."],
      { available: s.net.Ao, margin, adequacyPct: s.areaRequired ? (s.net.Ao / s.areaRequired) * 100 : null },
      margin !== null && margin < -1e-6 * s.net.Ao ? ["Available area is smaller than required area."] : [],
      s.areaRequired === null ? "invalid" : undefined),
  );

  // 5 Re
  const reNotes = [...s.tube.notes.filter((n) => n.startsWith("Transitional")), ...s.shell.notes.filter((n) => n.includes("outside the Kern"))];
  P.push(
    mk("Re", "Reynolds number", "Re", "–", s.tube.Re,
      "Re = ρ·v·Dh/μ  (shell side, S&T: Re = Gs·de/μ)",
      ["ρ, v, μ", "hydraulic diameter"],
      `Tube side shown as the value (${tubeLabel}); shell/annulus side in details. Regimes: laminar < 2300, transitional 2300–4000, turbulent > 4000.`,
      ["Hydraulic diameter: tube di; shell Kern equivalent diameter; annulus D₂ − D₁."],
      { tubeSide: s.tube.Re, shellSide: s.shell.Re, tubeRegime: s.tube.regime, shellRegime: s.shell.regime, tubeDh: s.tube.Dh, shellDh: s.shell.Dh },
      reNotes),
  );

  // 6 Nu
  const nuNotes: string[] = [];
  if (!s.NuTube.inRange) nuNotes.push(`Tube-side Nu outside validity range of ${s.NuTube.correlation}: ${s.NuTube.validity}.`);
  if (!s.NuShell.inRange) nuNotes.push(`Shell-side Nu outside validity range of ${s.NuShell.correlation}: ${s.NuShell.validity}.`);
  P.push(
    mk("Nu", "Nusselt number", "Nu", "–", s.NuTube.Nu,
      "Nu = h·Dh/k;  Gnielinski, Dittus–Boelter, Sieder–Tate, Hausen (laminar), Kern (shell)",
      ["Re", "Pr", "L/D", "heating/cooling"],
      "Correlation is chosen from the flow regime (auto) or by user selection with a validity check; out-of-range use is flagged, not hidden.",
      ["Wall viscosity ratio taken as 1."],
      { tubeSide: s.NuTube.Nu, shellSide: s.NuShell.Nu, tubeCorrelation: s.NuTube.correlation, tubeValidity: s.NuTube.validity, shellCorrelation: s.NuShell.correlation, shellValidity: s.NuShell.validity },
      nuNotes,
      nuNotes.length ? "out_of_range" : undefined),
  );

  // 7 Pr
  P.push(
    mk("Pr", "Prandtl number", "Pr", "–", prandtl(s.propsHot),
      "Pr = Cp·μ/k",
      ["Cp, μ, k at evaluation temperature"],
      "Value shown is for the hot stream; cold stream in details.",
      ["Properties evaluated at the stated temperature."],
      { hot: prandtl(s.propsHot), cold: prandtl(s.propsCold), hotEvalTempC: s.TevalHot, coldEvalTempC: s.TevalCold },
      warnsFor("PROPS_RANGE", "PROPS_MANUAL")),
  );

  // 8 dP
  P.push(
    mk("dP", "Pressure drop", "ΔP", "Pa", s.tube.dP,
      "Tube: ΔP = Np·f·(L/di)·ρv²/2 + K·ρv²/2 (Darcy–Weisbach);  Shell: Kern ΔP = Ns·f·Gs²/(2ρ)·(Ds/de)·(Nb+1)",
      ["f(Re, ε/D)", "ρ, v", "L, di, passes", "baffle spacing"],
      `Tube side (${tubeLabel}) shown as value; shell/annulus side (${shellLabel}) in details. Preliminary methods — not exact industrial predictions.`,
      ["Kern shell-side ignores leakage and bypass; Bell–Delaware is the recommended next step.", "Nozzle losses excluded."],
      { tubeSide: s.tube.dP, shellSide: s.shell.dP, tubeStraight: s.tube.dPBreakdown.straight ?? null, tubeMinor: s.tube.dPBreakdown.minor ?? null },
      [...s.tube.notes.filter((n) => n.startsWith("Transitional")), ...(s.shell.rePctValid ? [] : ["Shell-side Re outside Kern friction fit range."])]),
  );

  // 9 velocity
  const lim = (side: "tube" | "shell", phaseHot: boolean) => {
    const phase = (phaseHot ? (input.hot.fluidId ?? "") : (input.cold.fluidId ?? "")) === "air" ? "gas" : "liquid";
    if (phase === "gas") return op.velocityLimits.gas;
    return side === "tube" ? op.velocityLimits.liquidTube : op.velocityLimits.liquidShell;
  };
  const vNotes: string[] = [];
  const lt = lim("tube", tubeHot);
  const ls = lim("shell", !tubeHot);
  if (s.tube.velocity < lt[0]) vNotes.push(`Tube-side velocity ${s.tube.velocity.toFixed(2)} m/s is below ${lt[0]} m/s (fouling/low-h risk).`);
  if (s.tube.velocity > lt[1]) vNotes.push(`Tube-side velocity ${s.tube.velocity.toFixed(2)} m/s exceeds ${lt[1]} m/s (erosion/ΔP risk).`);
  if (s.shell.velocity < ls[0]) vNotes.push(`Shell-side velocity ${s.shell.velocity.toFixed(2)} m/s is below ${ls[0]} m/s.`);
  if (s.shell.velocity > ls[1]) vNotes.push(`Shell-side velocity ${s.shell.velocity.toFixed(2)} m/s exceeds ${ls[1]} m/s (vibration/erosion risk).`);
  P.push(
    mk("v", "Fluid velocity", "v", "m/s", s.tube.velocity,
      "v = Qv/Aflow;  Aflow,tube = (Nt/Np)·π·di²/4;  Aflow,shell = Ds·(p − do)·B/p",
      ["ṁ, ρ", "Nt, Np, di", "Ds, pitch, baffle spacing"],
      "Tube-side velocity accounts for the number of tubes carrying flow in each pass. Shell side is the crossflow velocity at the shell centreline (S&T) or annulus velocity.",
      ["Warning limits are configurable in operating settings."],
      { tubeSide: s.tube.velocity, shellSide: s.shell.velocity, tubeFlowArea: s.tube.flowArea, shellFlowArea: s.shell.flowArea, tubesPerPass: g.type === "double-pipe" ? 1 : g.Nt / g.tubePasses },
      vNotes),
  );

  // 10 eps
  P.push(
    mk("eps", "Heat exchanger effectiveness", "ε", "–", s.eps,
      "ε = Q/Qmax;  Qmax = Cmin·(Th,in − Tc,in)",
      ["Q", "Cmin", "Th,in", "Tc,in"],
      "Ratio of actual to thermodynamically maximum heat transfer.",
      [],
      { Qactual: s.Q, Qmax: s.Qmax, Cmin: s.Cmin },
      s.eps > 1 || s.eps < 0 ? ["Effectiveness outside [0,1]: inconsistent inputs."] : [],
      s.eps > 1 || s.eps < 0 ? "invalid" : undefined),
  );

  // 11 NTU
  let relation: string;
  let ntuRequired: number | null = null;
  if (s.config === "parallel") {
    relation = "ε = [1 − exp(−NTU(1+Cr))]/(1+Cr)  (parallel flow)";
    ntuRequired = ntuParallel(s.eps, s.Cr);
  } else if (s.config === "counter") {
    relation = "ε = [1 − exp(−NTU(1−Cr))]/[1 − Cr·exp(−NTU(1−Cr))], Cr<1;  ε = NTU/(1+NTU), Cr=1  (counterflow)";
    ntuRequired = ntuCounter(s.eps, s.Cr);
  } else {
    relation = `1 shell pass, 2n tube passes: ε₁ = 2/{1 + Cr + √(1+Cr²)·[1+exp(−NTU₁√(1+Cr²))]/[1−exp(−NTU₁√(1+Cr²))]}; ${g.shellPasses} shell passes in series by composition`;
    ntuRequired = ntuShellN(s.eps, s.Cr, g.shellPasses);
  }
  P.push(
    mk("NTU", "Number of transfer units", "NTU", "–", s.ntuAvailable,
      "NTU = UA/Cmin;  Cr = Cmin/Cmax;  " + relation,
      ["Uo, Ao", "Ch = ṁh·Cph, Cc = ṁc·Cpc"],
      "NTU of the actual geometry. Effectiveness–NTU relation is chosen from the configuration; multipass units use the shell-and-tube relations, not the simple single-pass equations.",
      [],
      { Ch: s.Ch, Cc: s.Cc, Cmin: s.Cmin, Cr: s.Cr, UA: s.net.UAo, NTUrequiredForDutyTemps: ntuRequired, epsPredictedAtAvailableArea: epsFor(s.config, s.ntuAvailable, s.Cr, g.shellPasses) },
      []),
  );

  // 12 fouling
  const RfTot = totalFoulingOutside(g, op.Rfi, op.Rfo);
  P.push(
    mk("Rf", "Fouling resistance", "Rf", "m²K/W", RfTot,
      "Rf,total(outside basis) = Rfi·do/di + Rfo;  effective: Rf = 1/Ud − 1/Uc",
      ["Rfi (inside area basis)", "Rfo (outside area basis)"],
      "Specified fouling resistances are used as given; fouling is not predicted from temperature and flow rate.",
      ["Fouling values are user inputs (e.g., TEMA tables), not computed."],
      { Rfi: op.Rfi, Rfo: op.Rfo, sharePctOfTotalResistance: ((s.net.Rfoul_i + s.net.Rfoul_o) / s.net.Rtotal) * 100, effectiveFromCleanDirty: 1 / s.net.Uo - 1 / s.net.UoClean }),
  );

  // 13 pump power
  const pt = pumpingPower(s.tube.dP, s.tube.Qv, op.pumpEfficiency);
  const ps = pumpingPower(s.shell.dP, s.shell.Qv, op.pumpEfficiency);
  P.push(
    mk("Wpump", "Pumping power", "Wpump", "W", pt.electrical + ps.electrical,
      "Whyd = ΔP·Qv;  Wpump = ΔP·Qv/ηpump",
      ["ΔP", "Qv = ṁ/ρ", "ηpump"],
      "Total electrical input for both circuits; hydraulic (fluid) power and per-circuit values in details.",
      ["One overall pump efficiency applied to both circuits."],
      { tubeHydraulic: pt.hydraulic, tubeElectrical: pt.electrical, shellHydraulic: ps.hydraulic, shellElectrical: ps.electrical, totalHydraulic: pt.hydraulic + ps.hydraulic }),
  );

  // 14 Rth
  P.push(
    mk("Rth", "Thermal resistance", "Rth", "K/W", s.net.Rtotal,
      "Rtotal = 1/(hi·Ai) + Rfi/Ai + ln(do/di)/(2π·kw·L·Nt) + Rfo/Ao + 1/(ho·Ao)",
      ["hi, ho", "Rfi, Rfo", "kw", "geometry"],
      "Component resistances over the whole exchanger; area-normalised (outside basis) values in details.",
      [],
      { innerConvection: s.net.Rconv_i, innerFouling: s.net.Rfoul_i, wall: s.net.Rwall, outerFouling: s.net.Rfoul_o, outerConvection: s.net.Rconv_o,
        totalAreaNormalised: s.net.normalised.total, innerConvectionNorm: s.net.normalised.conv_i, wallNorm: s.net.normalised.wall, outerConvectionNorm: s.net.normalised.conv_o }),
  );

  // 15 geometry
  P.push(
    mk("geom", "Tube diameter and length", "do", "m", d0,
      "do = di + 2t;  Ao = π·do·L·Nt",
      ["di", "t", "L", "Nt"],
      "User-supplied dimensions are inputs, never recomputed as unknowns. Use design mode to solve one chosen dimension.",
      [],
      { di: g.di, do: d0, t: g.t, L: g.L, Nt: g.Nt, Ai: s.net.Ai, Ao: s.net.Ao }),
  );

  // profile (equivalent single-pass UA that reproduces the terminal temperatures)
  let profile: TemperatureProfile | null = null;
  if (!hasErr && s.lmtdUncorrected !== null) {
    const Che = s.Q / (s.ThIn - s.ThOut);
    const Cce = s.Q / (s.TcOut - s.TcIn);
    const arrangement = s.config === "shell-multipass" ? "counter" : s.config;
    profile = temperatureProfile({
      arrangement,
      UA: s.Q / s.lmtdUncorrected,
      Ch: Che,
      Cc: Cce,
      ThIn: s.ThIn,
      TcIn: s.TcIn,
      equivalentRepresentation: s.config === "shell-multipass",
    });
  }
  void fmtPct;
  void shellP;
  void tubeP;
  return { ok: !hasErr, issues, parameters: P, profile, state: s };
}
