import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useView } from "../state/viewStore";
import { effectiveGeometry, evaluate } from "../simulation/solvers/exchangerSolver";
import { componentList, tubeLayout } from "../three/geometries/layout";
import { ErrorBoundary } from "./ErrorBoundary";
import { InputPanel } from "./InputPanel";
import { ResultsPanel } from "./ResultsPanel";
import { DisplayPanel, ViewToolbar } from "./ViewControls";
import { sampleConfiguration, sampleDoublePipe, SAMPLE_CONFIGURATION_LABEL } from "../engineering/sampleConfiguration";
import type { ExchangerInput } from "../engineering/types";
import { validateSchema } from "../engineering/validation/inputValidation";
import { SiteNav } from "./landing/Navigation";
import type { SiteRoute } from "./landing/routes";
import { LandingPage } from "./landing/Landing";
import { OverviewDashboard } from "./OverviewDashboard";
const HxCanvas = lazy(() => import("../three/scenes/HxCanvas").then((m) => ({ default: m.HxCanvas })));
const LabelOverlay = lazy(() => import("../three/scenes/labels").then((m) => ({ default: m.LabelOverlay })));
const PerformancePanel = lazy(() => import("./PerformancePanel").then((m) => ({ default: m.PerformancePanel })));

type Page = "Overview" | "3D Simulator" | "Engineering Calculator" | "Performance Analysis";
const pages: Page[] = ["Overview", "3D Simulator", "Engineering Calculator", "Performance Analysis"];
const routeFromLocation = (): SiteRoute => ({ "/simulator": "Simulator", "/documentation": "Documentation", "/about": "About" } as Record<string, SiteRoute>)[window.location.pathname] ?? "Home";

function download(name: string, type: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function html(value: unknown) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

function exportReport(input: ExchangerInput, ev: ReturnType<typeof evaluate>) {
  const canvas = document.querySelector("canvas");
  const image = canvas?.toDataURL("image/png") ?? "";
  const rows = ev.parameters.map(p => `<tr><td>${html(p.name)} (${html(p.symbol)})</td><td>${p.value === null ? "—" : p.value.toPrecision(5)} ${html(p.unit)}</td><td>${html(p.status)}</td><td><code>${html(p.formula)}</code><br>${html(p.inputs.join("; "))}<br>${html(p.assumptions.join("; "))}</td></tr>`).join("");
  const warnings = ev.issues.map(i => `<li>${html(i.severity)}: ${html(i.message)}</li>`).join("");
  const profileRows = ev.profile?.xi.filter((_, i) => i % 10 === 0).map((x, i) => `<tr><td>${(x * 100).toFixed(0)}%</td><td>${ev.profile!.Th[i * 10].toFixed(2)} °C</td><td>${ev.profile!.Tc[i * 10].toFixed(2)} °C</td></tr>`).join("") ?? "";
  const popup = window.open("", "_blank", "width=1000,height=800");
  if (!popup) { window.alert("Allow the report window to open, then choose Save as PDF in the print dialog."); return; }
  popup.document.write(`<!doctype html><html><head><title>HX Studio Engineering Report</title><style>body{font:14px Arial;color:#17212a;margin:36px}h1{color:#087f82}table{border-collapse:collapse;width:100%;margin-bottom:20px}td,th{border:1px solid #9aa7b2;padding:7px;text-align:left;vertical-align:top}img{max-width:100%;max-height:420px}.muted{color:#52616d}code{white-space:normal;font-size:11px}@media print{button{display:none}tr{break-inside:avoid}}</style></head><body><h1>HX Studio — Engineering Report</h1><p class="muted">Generated locally · ${html(new Date().toLocaleString())}</p><h2>Configuration and operating conditions</h2><p>${html(input.geometry.type)} · ${html(input.geometry.flow)} · ${html(input.mode)} mode · ${input.geometry.Nt} tubes × ${input.geometry.L} m</p><p>Geometry: di ${input.geometry.di} m; wall ${input.geometry.t} m; shell/outer pipe ${input.geometry.Ds} m; pitch ${input.geometry.pitch} m; ${input.geometry.tubePasses} tube passes, ${input.geometry.shellPasses} shell passes; baffle spacing ${input.geometry.baffleSpacing} m, cut ${input.geometry.baffleCut}.</p><p>Hot: ${html(input.hot.label)}, ${input.hot.Tin} °C in, ${input.hot.Tout ?? "calculated"} °C out, ${input.hot.mdot} kg/s · Cold: ${html(input.cold.label)}, ${input.cold.Tin} °C in, ${input.cold.Tout ?? "calculated"} °C out, ${input.cold.mdot} kg/s.</p><p>Fluid properties at evaluation temperature: hot ρ ${ev.state?.propsHot.rho ?? "—"} kg/m³, Cp ${ev.state?.propsHot.cp ?? "—"} J/kgK, μ ${ev.state?.propsHot.mu ?? "—"} Pa·s, k ${ev.state?.propsHot.k ?? "—"} W/mK; cold ρ ${ev.state?.propsCold.rho ?? "—"} kg/m³, Cp ${ev.state?.propsCold.cp ?? "—"} J/kgK, μ ${ev.state?.propsCold.mu ?? "—"} Pa·s, k ${ev.state?.propsCold.k ?? "—"} W/mK.</p>${image ? `<h2>3D model</h2><img src="${image}" alt="3D heat exchanger model screenshot">` : ""}<h2>Temperature profile data</h2><table><thead><tr><th>Hot-side position</th><th>Hot bulk temperature</th><th>Cold bulk temperature</th></tr></thead><tbody>${profileRows || "<tr><td colspan='3'>Profile unavailable</td></tr>"}</tbody></table><h2>Engineering results, equations and assumptions</h2><table><thead><tr><th>Parameter</th><th>Value</th><th>Status</th><th>Formula, inputs and assumptions</th></tr></thead><tbody>${rows}</tbody></table><h2>Warnings and scope</h2><p>Local correlation-based rating model; simplified Kern shell-side method where applicable. The temperature profile is an estimated bulk 1-D model; this application does not compute CFD.</p><ul>${warnings}</ul><button onclick="print()">Print / Save as PDF</button></body></html>`);
  popup.document.close();
}

export function App() {
  const [page, setPage] = useState<Page>(() => window.location.pathname === "/simulator" ? "3D Simulator" : "Overview");
  const [route, setRoute] = useState<SiteRoute>(routeFromLocation);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const fileRef = useRef<HTMLInputElement>(null);
  const input = useView((s) => s.input);
  const loadInput = useView((s) => s.loadInput);
  const ev = useMemo(() => evaluate(input), [input]);
  const g = useMemo(() => effectiveGeometry(input.geometry), [input.geometry]);
  const layout = useMemo(() => tubeLayout(g), [g]);
  const components = useMemo(() => componentList(g, layout), [g, layout]);
  const s = ev.state;

  useEffect(() => {
    const updateRoute = () => {
      const next = routeFromLocation();
      setRoute(next);
      if (next === "Simulator") setPage("3D Simulator");
      else if (next === "Home") setPage("Overview");
    };
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);
  const navigate = (next: SiteRoute) => {
    const paths: Record<SiteRoute, string> = { Home: "/", Simulator: "/simulator", Documentation: "/documentation", About: "/about" };
    if (window.location.pathname !== paths[next]) window.history.pushState({}, "", paths[next]);
    setRoute(next);
    if (next === "Simulator") setPage("3D Simulator");
  };

  const exportJson = () => download("hx-studio-project.json", "application/json", JSON.stringify(input, null, 2));
  const exportCsv = () => {
    const rows = [["Parameter", "Symbol", "Value", "Unit", "Status", "Formula"], ...ev.parameters.map(p => [p.name, p.symbol, p.value, p.unit, p.status, p.formula])];
    download("hx-studio-results.csv", "text/csv;charset=utf-8", rows.map(row => row.map(csvCell).join(",")).join("\r\n"));
  };
  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      const issues = validateSchema(value);
      if (issues.some(i => i.severity === "error")) throw new Error(issues.filter(i => i.severity === "error").map(i => i.message).join("; "));
      loadInput(value as ExchangerInput);
    } catch (error) { window.alert(`Could not import project: ${error instanceof Error ? error.message : "Invalid configuration file"}`); }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex h-dvh flex-col" style={{ background: "var(--bg)" }}>
      <SiteNav active={route} onNavigate={navigate} reducedMotion={reducedMotion} onReducedMotionChange={setReducedMotion}/>
      {route === "Home" ? <LandingPage onLaunch={() => navigate("Simulator")} reducedMotion={reducedMotion}/> : route === "Documentation" ? <main className="info-page"><article className="mx-auto max-w-4xl space-y-3">
        <h1><span>Engineering</span> Documentation</h1>
        <section className="hx-panel p-4"><h3>Calculation methods</h3><p className="hx-label">Rating mode solves outlet temperatures iteratively using effectiveness–NTU and temperature-dependent fluid properties. Duty mode uses specified terminal temperatures, compares hot and cold energy balances, computes LMTD and area adequacy. A multipass shell-and-tube unit uses a shell-pass effectiveness relation and LMTD correction factor; it is not treated as a simple single-pass counterflow exchanger.</p></section>
        <section className="hx-panel p-4"><h3>Correlations and scope</h3><p className="hx-label">Tube-side Nusselt number uses the selected/automatic Hausen, Gnielinski, Dittus–Boelter or Sieder–Tate method with validity checks. Shell-side heat transfer and pressure loss use preliminary Kern methods. Tube pressure loss uses Darcy–Weisbach with minor losses. These are preliminary engineering estimates, not detailed industrial rating and not CFD.</p></section>
        <section className="hx-panel p-4"><h3>Properties, units and limitations</h3><p className="hx-label">Calculations use SI units internally and Celsius for temperature (temperature differences equal kelvin differences). Library coverage is limited to the fluids and tabulated ranges listed in the project README; manual properties are constant over temperature. Fouling is user supplied and is not inferred from operating conditions. Inspect each result’s formula, status, assumptions and warnings before use.</p></section>
        <section className="hx-panel p-4"><h3>Profiles and visuals</h3><p className="hx-label">Temperature charts are numerical bulk-fluid profiles from a 1-D energy model. Animated particles and bands visualize calculated flow directions and bulk temperatures. No local turbulence, wall temperatures or CFD fields are calculated.</p></section>
      </article></main> : route === "About" ? <main className="info-page"><h1><span>HX</span> Studio</h1><p>HX Studio is a browser-based engineering workstation for configuring shell-and-tube and double-pipe exchangers, evaluating preliminary thermal and hydraulic performance, and inspecting synchronized parametric geometry.</p><p>Calculations run locally in your browser. Flow paths and temperature profiles are based on engineering correlations and a one-dimensional bulk model. The visual scene is an engineering visualization, not a CFD solver.</p><button type="button" className="launch-button" onClick={() => navigate("Simulator")}>Launch Simulator <span aria-hidden="true">→</span></button></main> : <div className="simulator-shell">
        <div className="simulator-project-actions">
          <button type="button" className="hx-btn" onClick={() => useView.getState().resetInputsToZero()} title="Clear numeric engineering inputs and begin a blank design">Reset to 0</button>
          <button type="button" className="hx-btn" onClick={() => loadInput(g.type === "double-pipe" ? sampleDoublePipe : sampleConfiguration)} title={SAMPLE_CONFIGURATION_LABEL}>Reset to sample</button>
          <button type="button" className="hx-btn" onClick={exportJson}>Save JSON</button>
          <button type="button" className="hx-btn" onClick={() => fileRef.current?.click()}>Load JSON</button>
          <input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={e => void importJson(e.target.files?.[0])} aria-label="Load HX Studio project JSON" />
          <button type="button" className="hx-btn" onClick={exportCsv}>Export CSV</button>
          <button type="button" className="hx-btn" onClick={() => exportReport(input, ev)}>Report / PDF</button>
        </div>
        <nav className="simulator-tabs" aria-label="Simulator workspace">
          {pages.map(label => <button key={label} type="button" aria-pressed={page === label} onClick={() => setPage(label)}>{label}</button>)}
        </nav>
        {page === "Overview" ? <OverviewDashboard input={input} ev={ev} onOpen={setPage}/> : page === "Performance Analysis" ? <main className="simulator-main" style={{ background: "var(--workspace)" }}><Suspense fallback={<div className="p-4 hx-label">Loading performance charts…</div>}><PerformancePanel input={input} ev={ev}/></Suspense></main> : page === "Engineering Calculator" ? <main className="simulator-main" style={{ background: "var(--workspace)" }}>
          <aside className="mx-auto w-full max-w-6xl min-w-0" style={{ background: "var(--sidebar)" }} aria-label="Engineering inputs"><InputPanel /></aside>
        </main> : <main className="simulator-main">
        <section className="order-1 min-w-0 flex shrink-0 flex-col" style={{ background: "var(--workspace)" }} aria-label="3D simulator">
          <ViewToolbar />
          <div className="relative h-[56dvh] min-h-[420px] max-h-[850px] shrink-0 lg:h-[62dvh]">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex h-full items-center justify-center hx-label">Loading 3D engineering model…</div>}>
                <HxCanvas g={g} layout={layout} ev={ev} />
                <LabelOverlay />
              </Suspense>
            </ErrorBoundary>
            <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1 text-[11px]">
              <span className="rounded border px-2 py-0.5" style={{ background: "var(--bg)", borderColor: "#E6A23C", color: "#E6A23C" }}>■ Hot stream</span>
              <span className="rounded border px-2 py-0.5" style={{ background: "var(--bg)", borderColor: "#00A6A6", color: "#00A6A6" }}>■ Cold stream</span>
            </div>
            {s ? (
              <div className="pointer-events-none absolute bottom-2 left-2 rounded border px-2 py-1 text-[11px]" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
                Q = {(s.Q / 1000).toFixed(1)} kW · ε = {s.eps.toFixed(3)} · Th,out = {s.ThOut.toFixed(1)} °C · Tc,out = {s.TcOut.toFixed(1)} °C
              </div>
            ) : null}
          </div>
          <DisplayPanel components={components} />
        </section>
        <section className="order-2 min-w-0 border-t p-2" style={{ borderColor: "var(--border)", background: "var(--sidebar)" }} aria-label="Calculation status and engineering parameters"><ResultsPanel ev={ev} layout={layout} components={components} /></section>
      </main>}
      {page === "3D Simulator" ? <footer className="flex flex-wrap items-center gap-x-4 border-t px-3 py-1 text-[11px]" style={{ borderColor: "var(--border)", background: "var(--sidebar)", color: "var(--text2)" }}>
        <span>{ev.ok ? "✓ Calculated" : "✕ Not calculated"}</span>
        <span>{ev.parameters.filter((p) => p.value !== null).length}/15 parameters</span>
        <span>Rendered tubes {layout.rendered}/{layout.requested}</span>
        <span>Bulk 1-D thermal model (not CFD)</span>
      </footer> : null}</div>}
    </div>
  );
}
