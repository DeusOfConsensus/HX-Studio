import { useState } from "react";
import { useView } from "../state/viewStore";
import type { ExchangerInput, FlowArrangement, GeometryInput, StreamInput } from "../engineering/types";
import { FLUIDS } from "../engineering/properties/fluidDatabase";
import { NumField, SelectField, Section } from "./ui";
import { solveSizing } from "../simulation/solvers/sizing";
import type { SizingVariable } from "../engineering/calculations/geometrySizing";

const fluidOptions: Array<[string, string]> = Object.values(FLUIDS).map((f) => [f.id, f.name]);

function FlowDiagram({ kind, selected }: { kind: FlowArrangement; selected: boolean }) {
  const hotDir = 1;
  const coldDir = kind === "parallel" ? 1 : -1;
  const arrow = (y: number, dir: number, color: string) => (
    <g stroke={color} fill={color} strokeWidth="2.5">
      <line x1={dir > 0 ? 18 : 102} y1={y} x2={dir > 0 ? 96 : 24} y2={y} />
      <polygon points={dir > 0 ? `104,${y} 94,${y - 5} 94,${y + 5}` : `16,${y} 26,${y - 5} 26,${y + 5}`} />
    </g>
  );
  return (
    <svg viewBox="0 0 120 56" className="w-full" aria-hidden="true">
      <rect x="8" y="6" width="104" height="44" rx="6" fill="none" stroke={selected ? "#00A6A6" : "#354452"} strokeWidth="2" />
      <line x1="8" y1="28" x2="112" y2="28" stroke="#354452" strokeWidth="2" strokeDasharray="4 3" />
      {arrow(17, hotDir, "#E6A23C")}
      {arrow(39, coldDir, "#00A6A6")}
    </svg>
  );
}

export function FlowSelector() {
  const input = useView((s) => s.input);
  const setInput = useView((s) => s.setInput);
  const multipass = input.geometry.type === "shell-and-tube" && input.geometry.tubePasses > 1;
  const cards: Array<[FlowArrangement, string, string]> = [
    ["parallel", "Parallel Flow", "Both fluids enter from the same end and move in the same direction."],
    ["counter", "Counter-Current Flow", "Both fluids enter from opposite ends and move in opposite directions."],
  ];
  return (
    <div className="hx-panel mb-2 p-3">
      <div className="mb-2 text-[13px] font-semibold tracking-wide">FLOW ARRANGEMENT</div>
      <div role="radiogroup" aria-label="Flow arrangement" className="grid grid-cols-2 gap-2">
        {cards.map(([k, name, text]) => {
          const sel = input.geometry.flow === k && !multipass;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={sel}
              disabled={multipass}
              onClick={() => setInput((x) => ({ ...x, geometry: { ...x.geometry, flow: k } }))}
              className="rounded border p-2 text-left"
              style={{ background: sel ? "#17323a" : "var(--bg)", borderColor: sel ? "var(--accent)" : "var(--border)", opacity: multipass ? 0.5 : 1, minHeight: 44 }}
            >
              <FlowDiagram kind={k} selected={sel} />
              <div className="mt-1 flex items-center gap-1 text-[12px] font-semibold">
                <span aria-hidden="true">{sel ? "●" : "○"}</span>
                {name}
              </div>
              <div className="hx-label text-[11px] leading-tight">{text}</div>
            </button>
          );
        })}
      </div>
      {multipass ? (
        <p className="hx-label mt-2 text-[11px]" role="note">
          Multipass shell-and-tube is rated as overall counter-current with correction factor F, so this selector does not apply. Use 1 tube pass for idealised parallel/counter flow.
        </p>
      ) : null}
    </div>
  );
}

function StreamFields({ which, s, set, duty }: { which: "hot" | "cold"; s: StreamInput; set: (p: Partial<StreamInput>) => void; duty: boolean }) {
  return (
    <>
      <div className="col-span-2">
        <SelectField
          label="Fluid (property library)"
          value={s.fluidId ?? "manual"}
          options={[...fluidOptions, ["manual", "Manual properties"]]}
          onChange={(v) => set(v === "manual" ? { fluidId: undefined, manual: s.manual ?? { rho: 0, cp: 0, mu: 0, k: 0 } } : { fluidId: v, manual: undefined })}
          tip="Temperature-dependent properties are interpolated from tabulated data at the mean bulk temperature."
        />
      </div>
      <NumField label="Inlet temperature" symbol="T,in" unit="°C" value={s.Tin} onCommit={(v) => set({ Tin: v })} min={-273} tip={`${which} inlet temperature`} />
      <NumField label="Mass flow rate" symbol="ṁ" unit="kg/s" value={s.mdot} onCommit={(v) => set({ mdot: v })} min={1e-6} />
      <NumField label="Operating pressure" symbol="P" unit="kPa" value={s.pressure} scale={1e-3} onCommit={(v) => set({ pressure: v })} min={1} tip="Absolute pressure; used for gas density." />
      {duty ? <NumField label="Outlet temperature" symbol="T,out" unit="°C" value={s.Tout} onCommit={(v) => set({ Tout: v })} min={-273} /> : null}
      {!s.fluidId && s.manual ? <>
        <div className="col-span-2 hx-label">Enter verified properties; zero values are invalid until replaced.</div>
        <NumField label="Density" symbol="ρ" unit="kg/m³" value={s.manual.rho} onCommit={(rho) => set({ manual: { ...s.manual!, rho } })} min={0.001}/>
        <NumField label="Specific heat" symbol="Cp" unit="J/kgK" value={s.manual.cp} onCommit={(cp) => set({ manual: { ...s.manual!, cp } })} min={0.001}/>
        <NumField label="Dynamic viscosity" symbol="μ" unit="Pa·s" value={s.manual.mu} onCommit={(mu) => set({ manual: { ...s.manual!, mu } })} min={1e-9}/>
        <NumField label="Conductivity" symbol="k" unit="W/mK" value={s.manual.k} onCommit={(k) => set({ manual: { ...s.manual!, k } })} min={1e-6}/>
      </> : null}
    </>
  );
}

export function InputPanel() {
  const [sizingVariable, setSizingVariable] = useState<SizingVariable>("L");
  const [sizingMessage, setSizingMessage] = useState("");
  const input = useView((s) => s.input);
  const setInput = useView((s) => s.setInput);
  const switchType = useView((s) => s.switchType);
  const g = input.geometry;
  const dp = g.type === "double-pipe";
  const setG = (p: Partial<GeometryInput>) => setInput((x) => ({ ...x, geometry: { ...x.geometry, ...p } }));
  const setStream = (w: "hot" | "cold") => (p: Partial<StreamInput>) => setInput((x) => ({ ...x, [w]: { ...x[w], ...p } }) as ExchangerInput);
  const setOp = (p: Partial<ExchangerInput["operating"]>) => setInput((x) => ({ ...x, operating: { ...x.operating, ...p } }));
  return (
    <div className="p-2">
      <div className="hx-panel mb-2 p-3">
        <SelectField
          label="Exchanger type"
          value={g.type}
          options={[["shell-and-tube", "Shell-and-tube"], ["double-pipe", "Double-pipe"]]}
          onChange={(t) => switchType(t)}
          tip="Each type keeps its own configuration; switching does not discard your edits."
        />
        <SelectField label="Calculation workflow" value={input.mode} options={[["rating", "Rating — predict outlet temperatures"], ["duty", "Duty — specified outlet temperatures"]]} onChange={(mode) => setInput((x) => ({ ...x, mode }))} />
        {input.mode === "duty" ? <SelectField label="Energy balance duty basis" value={input.dutySource} options={[["hot", "Hot-side Q"], ["cold", "Cold-side Q"], ["specified", "Specified duty"]]} onChange={(dutySource) => setInput((x) => ({ ...x, dutySource }))} /> : null}
        {input.mode === "duty" && input.dutySource === "specified" ? <NumField label="Specified heat duty" symbol="Q" unit="kW" scale={1e-3} value={input.specifiedQ} onCommit={(specifiedQ) => setInput((x) => ({ ...x, specifiedQ }))} min={0.001} /> : null}
        <div className="hx-label mt-2 text-[11px]">Rating solves outlet temperatures. Duty mode requires both outlet temperatures and reports energy-balance mismatch.</div>
      </div>
      <FlowSelector />
      <Section title="HOT STREAM" open>
        <StreamFields which="hot" s={input.hot} set={setStream("hot")} duty={input.mode === "duty"} />
      </Section>
      <Section title="COLD STREAM" open>
        <StreamFields which="cold" s={input.cold} set={setStream("cold")} duty={input.mode === "duty"} />
      </Section>
      <Section title="GEOMETRY" open>
        <div className="col-span-2">
          <SelectField
            label="Hot stream flows in"
            value={g.tubeSideStream === "hot" ? "tube" : "shell"}
            options={[["tube", dp ? "Inner tube" : "Tubes"], ["shell", dp ? "Annulus" : "Shell"]]}
            onChange={(v) => setG({ tubeSideStream: v === "tube" ? "hot" : "cold" })}
          />
        </div>
        <NumField label="Tube inside diameter" symbol="di" unit="mm" scale={1000} value={g.di} onCommit={(v) => setG({ di: v })} min={0.001} />
        <NumField label="Tube wall thickness" symbol="t" unit="mm" scale={1000} value={g.t} onCommit={(v) => setG({ t: v })} min={0.0001} tip="do = di + 2t" />
        <NumField label="Tube length" symbol="L" unit="m" value={g.L} onCommit={(v) => setG({ L: v })} min={0.05} />
        <NumField label={dp ? "Outer pipe inside diameter" : "Shell inside diameter"} symbol="Ds" unit="mm" scale={1000} value={g.Ds} onCommit={(v) => setG({ Ds: v })} min={0.01} />
        {!dp ? (
          <>
            <NumField label="Number of tubes" symbol="Nt" unit="–" value={g.Nt} onCommit={(v) => setG({ Nt: v })} min={1} integer />
            <NumField label="Tube pitch" symbol="p" unit="mm" scale={1000} value={g.pitch} onCommit={(v) => setG({ pitch: v })} min={0.002} />
            <SelectField label="Tube arrangement" value={g.arrangement} options={[["triangular", "Triangular"], ["square", "Square"]]} onChange={(v) => setG({ arrangement: v })} />
            <NumField label="Tube passes" symbol="Np" unit="–" value={g.tubePasses} onCommit={(v) => setG({ tubePasses: v })} min={1} integer tip="Even numbers only for multipass." />
            <NumField label="Shell passes" symbol="Ns" unit="–" value={g.shellPasses} onCommit={(v) => setG({ shellPasses: v })} min={1} integer />
            <NumField label="Baffle spacing" symbol="B" unit="mm" scale={1000} value={g.baffleSpacing} onCommit={(v) => setG({ baffleSpacing: v })} min={0.01} />
            <NumField label="Baffle cut" symbol="Bc" unit="%" scale={100} value={g.baffleCut} onCommit={(v) => setG({ baffleCut: v })} min={0.05} />
          </>
        ) : null}
        <NumField label="Wall conductivity" symbol="kw" unit="W/mK" value={g.kw} onCommit={(v) => setG({ kw: v })} min={0.1} />
      </Section>
      {!dp ? <Section title="DESIGN SIZING">
        <div className="col-span-2"><SelectField label="Solve one dimension" value={sizingVariable} options={[["L", "Tube length L"], ["Nt", "Tube count Nt"], ["di", "Tube inside diameter di"]]} onChange={setSizingVariable} /></div>
        <button type="button" className="hx-btn hx-btn-primary col-span-2" onClick={() => {
          const result = solveSizing(input, sizingVariable);
          setSizingMessage(result.message);
          if (result.status === "solved" && result.value !== null) setInput((x) => ({ ...x, geometry: { ...x.geometry, [sizingVariable]: result.value! } }));
        }}>Solve {sizingVariable} for required area</button>
        <div className="col-span-2 hx-label" role="status">{sizingMessage || (input.mode === "duty" ? "Fix all other dimensions and size one selected variable." : "Sizing requires duty mode with both outlet temperatures specified.")}</div>
      </Section> : null}
      <Section title="OPERATING CONDITIONS">
        <NumField label="Pump efficiency" symbol="ηpump" unit="%" scale={100} value={input.operating.pumpEfficiency} onCommit={(v) => setOp({ pumpEfficiency: v })} min={0.05} />
        <NumField label="Tube-side fouling" symbol="Rfi" unit="m²K/W" value={input.operating.Rfi} onCommit={(v) => setOp({ Rfi: v })} min={0} tip="Inside-area basis" />
        <NumField label="Shell-side fouling" symbol="Rfo" unit="m²K/W" value={input.operating.Rfo} onCommit={(v) => setOp({ Rfo: v })} min={0} tip="Outside-area basis" />
        <SelectField
          label="Tube-side Nu correlation"
          value={input.operating.correlation}
          options={[["auto", "Auto (by regime)"], ["gnielinski", "Gnielinski"], ["dittus-boelter", "Dittus–Boelter"], ["sieder-tate", "Sieder–Tate"]]}
          onChange={(v) => setOp({ correlation: v })}
        />
      </Section>
    </div>
  );
}
