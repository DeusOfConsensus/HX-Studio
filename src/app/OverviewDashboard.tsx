import type { ExchangerInput } from "../engineering/types";
import type { Evaluation } from "../simulation/solvers/exchangerSolver";

type Workspace = "3D Simulator" | "Engineering Calculator" | "Performance Analysis";

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="hx-panel overview-metric"><p>{label}</p><strong>{value}</strong><span>{note}</span></article>;
}

export function OverviewDashboard({ input, ev, onOpen }: { input: ExchangerInput; ev: Evaluation; onOpen: (page: Workspace) => void }) {
  const g = input.geometry;
  const s = ev.state;
  const parameter = (id: string) => ev.parameters.find((p) => p.id === id)?.value;
  const heat = parameter("Q");
  const lmtd = parameter("LMTD");
  const overallU = parameter("U");
  const effectiveness = s?.eps;
  const warnings = ev.issues.filter((issue) => issue.severity !== "error");
  const errors = ev.issues.filter((issue) => issue.severity === "error");
  const fmt = (value: number | null | undefined, digits = 3) => value === null || value === undefined || !Number.isFinite(value) ? "—" : Number(value.toPrecision(digits)).toLocaleString();

  return <main className="simulator-main overview-dashboard">
    <header className="overview-heading">
      <div><p className="overview-eyebrow">HX STUDIO WORKSPACE</p><h1>Project overview</h1><p className="hx-label">Review the current exchanger design and jump into a focused workspace.</p></div>
      <span className={`overview-status ${ev.ok ? "is-ready" : "is-error"}`}>{ev.ok ? "● Calculation ready" : "● Check inputs"}</span>
    </header>
    <section className="overview-metrics" aria-label="Key engineering results">
      <Metric label="Heat transfer rate" value={heat == null ? "—" : `${fmt(heat / 1000)} kW`} note="Calculated duty" />
      <Metric label="Effectiveness" value={fmt(effectiveness)} note="ε–NTU result" />
      <Metric label="LMTD" value={lmtd == null ? "—" : `${fmt(lmtd)} K`} note="Log-mean temperature difference" />
      <Metric label="Overall coefficient" value={overallU == null ? "—" : `${fmt(overallU)} W/m²K`} note="Outside-area basis" />
    </section>
    <div className="overview-lower">
      <section className="hx-panel overview-card">
        <div className="overview-card-heading"><div><p className="overview-eyebrow">CURRENT DESIGN</p><h2>{g.type === "shell-and-tube" ? "Shell-and-tube exchanger" : "Double-pipe exchanger"}</h2></div><span className="overview-design-icon" aria-hidden="true">◈</span></div>
        <dl className="overview-specs">
          <div><dt>Flow arrangement</dt><dd>{s?.config === "shell-multipass" ? `${g.shellPasses} shell / ${g.tubePasses} tube passes` : g.flow === "counter" ? "Counter-current" : "Parallel"}</dd></div>
          <div><dt>Tube length</dt><dd>{fmt(g.L, 4)} m</dd></div>
          <div><dt>Tube count</dt><dd>{g.type === "shell-and-tube" ? g.Nt.toLocaleString() : "1 inner tube"}</dd></div>
          <div><dt>Shell / outer pipe</dt><dd>{fmt(g.Ds * 1000, 4)} mm</dd></div>
          <div><dt>Hot outlet</dt><dd>{s ? `${fmt(s.ThOut, 4)} °C` : "—"}</dd></div>
          <div><dt>Cold outlet</dt><dd>{s ? `${fmt(s.TcOut, 4)} °C` : "—"}</dd></div>
        </dl>
      </section>
      <section className="hx-panel overview-card">
        <div className="overview-card-heading"><div><p className="overview-eyebrow">ANALYSIS STATUS</p><h2>{ev.ok ? "Ready to inspect" : "Attention required"}</h2></div><span className="overview-design-icon" aria-hidden="true">⌁</span></div>
        {errors.length ? <ul className="overview-issues is-error">{errors.slice(0, 3).map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul> : warnings.length ? <ul className="overview-issues">{warnings.slice(0, 3).map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul> : <p className="hx-label overview-clean">No engineering warnings for the current configuration.</p>}
        <div className="overview-workspaces" aria-label="Open a workspace">
          <button type="button" onClick={() => onOpen("3D Simulator")}><strong>3D Simulator</strong><span>Inspect flow and the assembled model</span><b aria-hidden="true">→</b></button>
          <button type="button" onClick={() => onOpen("Engineering Calculator")}><strong>Engineering Calculator</strong><span>Edit conditions and inspect results</span><b aria-hidden="true">→</b></button>
          <button type="button" onClick={() => onOpen("Performance Analysis")}><strong>Performance Analysis</strong><span>Review profiles and sensitivity</span><b aria-hidden="true">→</b></button>
        </div>
      </section>
    </div>
    <p className="overview-footnote">Correlation-based preliminary results · 1-D bulk thermal model · not CFD or certified design</p>
  </main>;
}
