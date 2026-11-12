import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { ExchangerInput } from "../engineering/types";
import { evaluate } from "../simulation/solvers/exchangerSolver";
import { epsCounter, epsParallel, epsShellN } from "../engineering/correlations/effectivenessNtu";

const COLORS = { hot: "#E6A23C", cold: "#00A6A6", other: "#A9B5C0" };
const mult = (input: ExchangerInput, scale: number, field: "hot" | "cold") => ({ ...input, [field]: { ...input[field], mdot: input[field].mdot * scale } });

export function PerformancePanel({ input, ev }: { input: ExchangerInput; ev: ReturnType<typeof evaluate> }) {
  const [sensitivity, setSensitivity] = useState<"hot-flow" | "cold-flow" | "tube-length" | "tube-count" | "fouling" | "hot-inlet" | "cold-inlet" | "tube-diameter" | "wall-conductivity">("hot-flow");
  const profile = ev.profile?.xi.map((x, i) => ({ x: Math.round(x * 100), Hot: ev.profile!.Th[i], Cold: ev.profile!.Tc[i] })) ?? [];
  const ntuCurve = ev.state ? Array.from({ length: 41 }, (_, i) => {
    const ntu = i * 0.2;
    const { config, Cr } = ev.state!;
    const effectiveness = config === "parallel" ? epsParallel(ntu, Cr) : config === "counter" ? epsCounter(ntu, Cr) : epsShellN(ntu, Cr, input.geometry.shellPasses);
    return { ntu, effectiveness };
  }) : [];
  const curves = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const factor = 0.6 + i * 0.1;
    let trial = input;
    if (sensitivity === "hot-flow") trial = mult(input, factor, "hot");
    if (sensitivity === "cold-flow") trial = mult(input, factor, "cold");
    if (sensitivity === "tube-length") trial = { ...input, geometry: { ...input.geometry, L: input.geometry.L * factor } };
    if (sensitivity === "tube-count") trial = { ...input, geometry: { ...input.geometry, Nt: Math.max(1, Math.round(input.geometry.Nt * factor)) } };
    if (sensitivity === "fouling") trial = { ...input, operating: { ...input.operating, Rfi: input.operating.Rfi * factor, Rfo: input.operating.Rfo * factor } };
    const inletSpan = Math.max(1, Math.abs(input.hot.Tin - input.cold.Tin));
    if (sensitivity === "hot-inlet") trial = { ...input, hot: { ...input.hot, Tin: input.hot.Tin + (factor - 1) * inletSpan } };
    if (sensitivity === "cold-inlet") trial = { ...input, cold: { ...input.cold, Tin: input.cold.Tin - (factor - 1) * inletSpan } };
    if (sensitivity === "tube-diameter") trial = { ...input, geometry: { ...input.geometry, di: input.geometry.di * factor } };
    if (sensitivity === "wall-conductivity") trial = { ...input, geometry: { ...input.geometry, kw: input.geometry.kw * factor } };
    const e = evaluate(trial);
    return { factor: Math.round(factor * 100), heat: e.state ? e.state.Q / 1000 : null, effectiveness: e.state?.eps ?? null,
      tubeDP: e.state ? e.state.tube.dP / 1000 : null, shellDP: e.state ? e.state.shell.dP / 1000 : null,
      tubeRe: e.state?.tube.Re ?? null, ntu: e.state?.ntuAvailable ?? null, outerFouling: e.state?.net.Rfoul_o ?? null };
  }), [input, sensitivity]);
  const resistance = ev.state ? [
    { name: "Tube convection", value: ev.state.net.Rconv_i }, { name: "Tube fouling", value: ev.state.net.Rfoul_i },
    { name: "Wall", value: ev.state.net.Rwall }, { name: "Shell fouling", value: ev.state.net.Rfoul_o },
    { name: "Shell convection", value: ev.state.net.Rconv_o },
  ] : [];
  const common = { margin: { top: 8, right: 12, bottom: 2, left: 0 } };
  return <div className="space-y-3 p-3">
    <section className="hx-panel p-3">
      <h2 className="m-0 mb-1 text-sm font-semibold">Bulk temperature profile</h2>
      <p className="hx-label mb-2">Numerical 1-D profile from the solver; position follows the hot stream. {ev.profile?.note}</p>
      {profile.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={profile} margin={common.margin}>
        <CartesianGrid stroke="#354452" strokeDasharray="3 3"/><XAxis dataKey="x" stroke="#A9B5C0" label={{ value: "Exchanger position (%)", position: "insideBottom", offset: -2, fill: "#A9B5C0" }}/>
        <YAxis stroke="#A9B5C0" unit=" °C"/><Tooltip contentStyle={{ background: "#151F29", borderColor: "#354452" }}/><Legend/>
        <Line type="monotone" dataKey="Hot" stroke={COLORS.hot} dot={false} isAnimationActive={false}/><Line type="monotone" dataKey="Cold" stroke={COLORS.cold} dot={false} isAnimationActive={false}/>
      </LineChart></ResponsiveContainer></div> : <p className="hx-label">A valid calculation is required to plot a temperature profile.</p>}
    </section>
    <section className="hx-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-sm font-semibold">Operating sensitivity</h2>
        <select className="hx-input max-w-64" aria-label="Sensitivity parameter" value={sensitivity} onChange={e => setSensitivity(e.target.value as typeof sensitivity)}>
          <option value="hot-flow">Hot-side mass flow</option><option value="cold-flow">Cold-side mass flow</option><option value="hot-inlet">Hot-side inlet temperature</option><option value="cold-inlet">Cold-side inlet temperature</option><option value="tube-diameter">Tube inside diameter</option><option value="tube-length">Tube length</option><option value="tube-count">Tube count</option><option value="fouling">Fouling resistance</option><option value="wall-conductivity">Wall conductivity</option>
        </select>
      </div>
      <p className="hx-label mt-1 mb-2">Each point re-runs the engineering solver with the selected input scaled from 60% to 140% of its current value.</p>
      <div className="h-60"><ResponsiveContainer width="100%" height="100%"><LineChart data={curves} margin={common.margin}>
        <CartesianGrid stroke="#354452" strokeDasharray="3 3"/><XAxis dataKey="factor" stroke="#A9B5C0" unit="%"/><YAxis yAxisId="left" stroke="#A9B5C0"/><YAxis yAxisId="right" orientation="right" stroke="#A9B5C0"/><Tooltip contentStyle={{ background: "#151F29", borderColor: "#354452" }}/><Legend/>
        <Line yAxisId="left" dataKey="heat" name="Duty (kW)" stroke={COLORS.hot} dot={false} isAnimationActive={false}/><Line yAxisId="right" dataKey="effectiveness" name="Effectiveness" stroke={COLORS.cold} dot={false} isAnimationActive={false}/>
      </LineChart></ResponsiveContainer></div>
      <div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart data={ntuCurve} margin={common.margin}>
        <CartesianGrid stroke="#354452" strokeDasharray="3 3"/><XAxis dataKey="ntu" name="NTU" stroke="#A9B5C0"/><YAxis stroke="#A9B5C0" domain={[0, 1]}/><Tooltip contentStyle={{ background: "#151F29", borderColor: "#354452" }}/><Legend/>
        <Line dataKey="effectiveness" name="Effectiveness–NTU relation for selected model" stroke={COLORS.cold} dot={false} isAnimationActive={false}/>
      </LineChart></ResponsiveContainer></div>
      <div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={curves} margin={common.margin}>
        <CartesianGrid stroke="#354452" strokeDasharray="3 3"/><XAxis dataKey="factor" stroke="#A9B5C0" unit="%"/><YAxis stroke="#A9B5C0" unit=" kPa"/><Tooltip contentStyle={{ background: "#151F29", borderColor: "#354452" }}/><Legend/>
        <Line dataKey="tubeDP" name="Tube-side ΔP" stroke={COLORS.cold} dot={false} isAnimationActive={false}/><Line dataKey="shellDP" name="Shell-side ΔP" stroke={COLORS.hot} dot={false} isAnimationActive={false}/>
      </LineChart></ResponsiveContainer></div>
      <div className="h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={curves} margin={common.margin}>
        <CartesianGrid stroke="#354452" strokeDasharray="3 3"/><XAxis dataKey="factor" stroke="#A9B5C0" unit="%"/><YAxis stroke="#A9B5C0"/><Tooltip contentStyle={{ background: "#151F29", borderColor: "#354452" }}/><Legend/>
        <Line dataKey="tubeRe" name="Tube-side Reynolds number" stroke={COLORS.other} dot={false} isAnimationActive={false}/>
      </LineChart></ResponsiveContainer></div>
    </section>
    <section className="hx-panel p-3"><h2 className="m-0 mb-2 text-sm font-semibold">Thermal resistance contributions</h2>
      {resistance.length ? <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={resistance} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 12 }}>
        <CartesianGrid stroke="#354452" strokeDasharray="3 3"/><XAxis type="number" stroke="#A9B5C0"/><YAxis type="category" dataKey="name" width={130} stroke="#A9B5C0"/><Tooltip contentStyle={{ background: "#151F29", borderColor: "#354452" }}/><Bar dataKey="value" name="Resistance (K/W)" fill={COLORS.cold}/>
      </BarChart></ResponsiveContainer></div> : <p className="hx-label">Resistance breakdown unavailable.</p>}
    </section>
  </div>;
}
