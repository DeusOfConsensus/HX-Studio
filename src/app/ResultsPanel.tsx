import type { Evaluation } from "../simulation/solvers/exchangerSolver";
import type { ParamResult, ParamStatus } from "../engineering/types";
import { useView } from "../state/viewStore";
import type { ComponentInfo, TubeLayout } from "../three/geometries/layout";
import { arrangementNote, flowPlan } from "../three/geometries/layout";

const STATUS: Record<ParamStatus, { icon: string; label: string; color: string }> = {
  calculated: { icon: "✓", label: "Calculated", color: "var(--ok)" },
  warning: { icon: "⚠", label: "Engineering warning", color: "var(--warn)" },
  incomplete: { icon: "…", label: "Incomplete inputs", color: "var(--warn)" },
  invalid: { icon: "✕", label: "Invalid input", color: "var(--err)" },
  out_of_range: { icon: "⚠", label: "Outside correlation validity range", color: "var(--warn)" },
  unavailable: { icon: "—", label: "Calculation unavailable", color: "var(--text2)" },
};

function num(v: number | null, unit: string): { text: string; unit: string } {
  if (v === null || !Number.isFinite(v)) return { text: "—", unit };
  if (unit === "W" && Math.abs(v) >= 1000) return { text: (v / 1000).toPrecision(4), unit: "kW" };
  if (unit === "Pa" && Math.abs(v) >= 1000) return { text: (v / 1000).toPrecision(4), unit: "kPa" };
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return { text: v.toExponential(3), unit };
  return { text: Number(v.toPrecision(4)).toString(), unit };
}

function detailValue(v: number | string | null): string {
  if (v === null) return "—";
  if (typeof v === "string") return v;
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(3);
  return Number(v.toPrecision(5)).toString();
}

function ParamRow({ p }: { p: ParamResult }) {
  const st = STATUS[p.status];
  const n = num(p.value, p.unit);
  return (
    <details className="hx-panel mb-1">
      <summary style={{ minHeight: 48 }}>
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
          <span className="min-w-0 truncate">
            {p.name} <i className="hx-label">{p.symbol}</i>
          </span>
          <span className="shrink-0 text-[14px]">
            <b>{n.text}</b> <span className="hx-label">{n.unit}</span>{" "}
            <span style={{ color: st.color }} title={st.label} aria-label={st.label}>
              {st.icon}
            </span>
          </span>
        </span>
      </summary>
      <div className="space-y-2 px-3 pb-3 text-[12px]">
        <div style={{ color: st.color }}>
          {st.icon} {st.label}
        </div>
        {p.formula ? <div className="rounded p-2 font-mono text-[11px]" style={{ background: "var(--bg)" }}>{p.formula}</div> : null}
        <div className="hx-label">{p.explanation}</div>
        {p.inputs.length ? (
          <div>
            <span className="hx-label">Inputs: </span>
            {p.inputs.join("; ")}
          </div>
        ) : null}
        {Object.keys(p.details).length ? (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
            {Object.entries(p.details).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="hx-label truncate">{k}</dt>
                <dd className="text-right">{detailValue(v)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {p.assumptions.length ? (
          <ul className="hx-label list-disc pl-4">
            {p.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
        {p.notes.map((nn) => (
          <div key={nn} style={{ color: "var(--warn)" }}>
            ⚠ {nn}
          </div>
        ))}
      </div>
    </details>
  );
}

export function ResultsPanel({ ev, layout, components }: { ev: Evaluation; layout: TubeLayout; components: ComponentInfo[] }) {
  const input = useView((s) => s.input);
  const selected = useView((s) => s.selected);
  const selectedTube = useView((s) => s.selectedTube);
  const g = input.geometry;
  const plan = flowPlan(g);
  const sel = components.find((c) => c.id === selected);
  const tube = selected === "tubes" && selectedTube !== null ? layout.tubes[selectedTube] : undefined;
  const note = arrangementNote(g);
  const errors = ev.issues.filter((i) => i.severity === "error");
  const warnings = ev.issues.filter((i) => i.severity === "warning");
  return (
    <div className="p-2">
      <div className="hx-panel mb-2 p-3 text-[12px]" role="status" aria-live="polite">
        <div className="mb-1 text-[13px] font-semibold tracking-wide">STATUS</div>
        {ev.ok ? <div style={{ color: "var(--ok)" }}>✓ Calculated{warnings.length ? ` with ${warnings.length} warning(s)` : ""}</div> : <div style={{ color: "var(--err)" }}>✕ Cannot calculate — fix the inputs below</div>}
        <div className="hx-label mt-1">{plan.description}</div>
        {errors.map((i, k) => (
          <div key={k} style={{ color: "var(--err)" }}>
            ✕ {i.message}
          </div>
        ))}
        {warnings.map((i, k) => (
          <div key={k} style={{ color: "var(--warn)" }}>
            ⚠ {i.message}
          </div>
        ))}
        {!layout.fitsShell ? (
          <div style={{ color: "var(--warn)" }}>
            ⚠ Geometry/calculation mismatch: {layout.requested} tubes requested but only {layout.capacity} fit; the 3D model draws {layout.rendered}.
          </div>
        ) : null}
        {layout.capped ? <div className="hx-label">Showing {layout.rendered} of {layout.requested} tubes (performance limit). Calculations use all {layout.requested}.</div> : null}
        {note ? <div className="hx-label">{note}</div> : null}
      </div>

      {sel ? (
        <div className="hx-panel mb-2 p-3 text-[12px]">
          <div className="mb-1 text-[13px] font-semibold tracking-wide">SELECTED: {sel.name.toUpperCase()}</div>
          <div>{sel.dims}</div>
          {tube ? (
            <div className="hx-label mt-1">
              Tube #{tube.index + 1} · pass {tube.pass + 1} of {plan.passes} · offset y = {(tube.y * 1000).toFixed(1)} mm, z = {(tube.z * 1000).toFixed(1)} mm
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-1 px-1 text-[13px] font-semibold tracking-wide">ENGINEERING PARAMETERS</div>
      {ev.parameters.map((p) => (
        <ParamRow key={p.id} p={p} />
      ))}
      <p className="hx-label mt-3 px-1 text-[11px] leading-snug">
        Values are calculated from engineering correlations (ε–NTU, Kern shell side, Gnielinski/Hausen tube side). The temperature colours, particles and bands are a depiction of a 1-D bulk-temperature model. This is not CFD: no turbulence, local velocity or wall-temperature fields are computed.
      </p>
    </div>
  );
}
