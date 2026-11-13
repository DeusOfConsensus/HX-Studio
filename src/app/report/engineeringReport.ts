import type { Evaluation } from "../../simulation/solvers/exchangerSolver";
import type { ExchangerInput, ParamResult } from "../../engineering/types";

function escapeHtml(value: unknown): string {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (unit === "W" && Math.abs(value) >= 1000) return `${(value / 1000).toPrecision(4)} kW`;
  if (unit === "Pa" && Math.abs(value) >= 1000) return `${(value / 1000).toPrecision(4)} kPa`;
  return `${Number(value.toPrecision(5)).toString()} ${unit}`.trim();
}

function renderParameterRow(parameter: ParamResult): string {
  return `<tr>
    <td><strong>${escapeHtml(parameter.name)}</strong><span class="symbol">${escapeHtml(parameter.symbol)}</span></td>
    <td class="value">${escapeHtml(formatValue(parameter.value, parameter.unit))}</td>
    <td><span class="status status-${escapeHtml(parameter.status)}">${escapeHtml(parameter.status.replaceAll("_", " "))}</span></td>
  </tr>`;
}

function renderCalculationDetail(parameter: ParamResult): string {
  const assumptions = parameter.assumptions.length
    ? `<ul>${parameter.assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const notes = parameter.notes.length
    ? `<ul class="detail-notes">${parameter.notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  return `<article class="detail-card">
    <div class="detail-heading"><h3>${escapeHtml(parameter.name)}</h3><span>${escapeHtml(parameter.symbol)} · ${escapeHtml(formatValue(parameter.value, parameter.unit))}</span></div>
    ${parameter.formula ? `<p class="formula">${escapeHtml(parameter.formula)}</p>` : ""}
    ${parameter.explanation ? `<p>${escapeHtml(parameter.explanation)}</p>` : ""}
    ${parameter.inputs.length ? `<p class="detail-label"><strong>Inputs:</strong> ${escapeHtml(parameter.inputs.join(" · "))}</p>` : ""}
    ${Object.keys(parameter.details).length ? `<p class="detail-label"><strong>Additional values:</strong> ${escapeHtml(Object.entries(parameter.details).map(([key, value]) => `${key}: ${value ?? "—"}`).join(" · "))}</p>` : ""}
    ${assumptions}${notes}
  </article>`;
}

function summaryCard(label: string, parameter: ParamResult | undefined): string {
  const value = !parameter
    ? "—"
    : parameter.id === "eps" && parameter.value !== null
      ? `${(parameter.value * 100).toFixed(1)}%`
      : formatValue(parameter.value, parameter.unit);
  return `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

export function createEngineeringReportHtml(
  input: ExchangerInput,
  evaluation: Evaluation,
  options: { logoUrl: string; modelImage?: string; generatedAt?: Date },
): string {
  const { geometry, hot, cold, operating } = input;
  const state = evaluation.state;
  const parameters = evaluation.parameters;
  const byId = (id: string) => parameters.find((parameter) => parameter.id === id);
  const generatedAt = (options.generatedAt ?? new Date()).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const configurationName = geometry.type === "shell-and-tube" ? "Shell-and-tube" : "Double-pipe";
  const flowName = geometry.flow === "parallel" ? "Parallel flow" : "Counter-current flow";
  const statusText = evaluation.ok ? "Calculation completed" : "Calculation needs attention";
  const issueRows = evaluation.issues.length
    ? evaluation.issues.map((issue) => `<li class="issue-${escapeHtml(issue.severity)}"><strong>${escapeHtml(issue.severity)}:</strong> ${escapeHtml(issue.message)}</li>`).join("")
    : "<li>No calculation warnings or errors were reported.</li>";

  const profile = evaluation.profile;
  const profileRows = profile
    ? profile.xi.map((x, index) => index % 10 === 0 || index === profile.xi.length - 1
      ? `<tr><td>${(x * 100).toFixed(0)}%</td><td>${profile.Th[index].toFixed(2)} °C</td><td>${profile.Tc[index].toFixed(2)} °C</td></tr>`
      : "").join("")
    : "<tr><td colspan=\"3\">Temperature profile is unavailable for this configuration.</td></tr>";
  const modelSection = `<section class="report-section model-section">
        <div class="section-heading"><span class="section-index">04</span><div><h2>3D model view</h2><p>Captured from the active simulator view at report generation.</p></div></div>
        ${options.modelImage
          ? `<figure><img class="model-image" src="${escapeHtml(options.modelImage)}" alt="Screenshot of the active three-dimensional heat exchanger model"><figcaption>HX Studio model visualization · Geometry is illustrative and is not a fabrication drawing.</figcaption></figure>`
          : `<p class="scope-note">A model screenshot was unavailable in this browser session. The configuration and calculation report is complete.</p>`}
      </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HX Studio — Engineering Report</title>
  <style>
    :root { color-scheme: light; --ink:#142a38; --muted:#536b79; --line:#d5e0e6; --soft:#f2f6f8; --cyan:#00aebf; --navy:#09202d; --warning:#a15a05; --danger:#a52f32; }
    * { box-sizing:border-box; }
    body { margin:0; background:#e9eff2; color:var(--ink); font:14px/1.5 "Segoe UI",Arial,sans-serif; }
    .page { width:min(100%, 980px); margin:28px auto; padding:40px 48px 36px; background:#fff; box-shadow:0 8px 32px #0b26351a; }
    .report-header { display:flex; justify-content:space-between; align-items:center; gap:24px; padding-bottom:22px; border-bottom:3px solid var(--cyan); }
    .brand { display:flex; align-items:center; min-width:0; }
    .brand img { display:block; width:168px; height:72px; object-fit:contain; object-position:left center; }
    .brand-fallback { display:none; color:var(--navy); font-size:26px; font-weight:800; letter-spacing:-.04em; }
    .header-meta { text-align:right; color:var(--muted); font-size:12px; }
    .header-meta strong { display:block; color:var(--ink); font-size:14px; }
    .report-title { padding:28px 0 22px; }
    .eyebrow { margin:0 0 5px; color:#078997; font-size:11px; font-weight:800; letter-spacing:.13em; text-transform:uppercase; }
    h1 { margin:0; color:var(--navy); font-size:30px; line-height:1.15; letter-spacing:-.035em; }
    .subtitle { margin:8px 0 0; color:var(--muted); }
    .status-banner { display:flex; align-items:center; gap:10px; margin:0 0 20px; padding:12px 15px; border:1px solid var(--line); border-left:4px solid ${evaluation.ok ? "#159766" : "#c23b3b"}; background:var(--soft); font-weight:700; }
    .summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:28px; }
    .summary-card { min-height:84px; padding:13px 14px; border:1px solid var(--line); border-radius:6px; background:#fbfdfe; }
    .summary-card span { display:block; margin-bottom:7px; color:var(--muted); font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
    .summary-card strong { color:#087f8d; font-size:18px; line-height:1.25; }
    .report-section { margin-top:28px; break-inside:auto; }
    .section-heading { display:flex; align-items:center; gap:12px; margin-bottom:13px; padding-bottom:9px; border-bottom:1px solid var(--line); break-after:avoid; }
    .section-index { display:grid; width:30px; height:30px; place-items:center; flex:none; border-radius:5px; background:var(--navy); color:#fff; font-size:11px; font-weight:800; }
    h2 { margin:0; color:var(--navy); font-size:17px; line-height:1.2; }
    .section-heading p { margin:3px 0 0; color:var(--muted); font-size:12px; }
    .two-col { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .info-card { padding:13px 15px; border:1px solid var(--line); border-radius:5px; break-inside:avoid; }
    .info-card h3 { margin:0 0 8px; color:#087f8d; font-size:13px; }
    table { width:100%; border-collapse:collapse; }
    th { padding:8px 9px; background:var(--navy); color:#fff; font-size:11px; text-align:left; letter-spacing:.035em; }
    td { padding:7px 9px; border-bottom:1px solid var(--line); vertical-align:top; }
    tbody tr:nth-child(even) { background:#f6f9fa; }
    .data-table { font-size:12px; }
    .symbol { display:block; color:var(--muted); font-size:10px; }
    .value { font-weight:700; white-space:nowrap; }
    .status { display:inline-block; padding:2px 7px; border-radius:999px; background:#e8f4ef; color:#176a4b; font-size:10px; font-weight:700; text-transform:capitalize; }
    .status-warning,.status-out_of_range { background:#fff3df; color:#8a510a; }
    .status-incomplete,.status-unavailable { background:#edf1f4; color:#52616d; }
    .status-invalid { background:#fdeceb; color:#9f302e; }
    .property-table td:first-child { color:var(--muted); }
    .model-section figure { margin:0; padding:12px; border:1px solid var(--line); border-radius:6px; background:#071722; text-align:center; break-inside:avoid; }
    .model-image { display:block; width:100%; max-height:480px; object-fit:contain; }
    figcaption { margin-top:8px; color:#d5e0e6; font-size:10px; }
    .profile-table { max-width:540px; font-variant-numeric:tabular-nums; }
    .detail-card { margin:0 0 9px; padding:11px 13px; border:1px solid var(--line); border-radius:5px; break-inside:avoid; }
    .detail-heading { display:flex; justify-content:space-between; gap:14px; align-items:baseline; margin-bottom:5px; }
    .detail-heading h3 { margin:0; color:#087f8d; font-size:13px; }
    .detail-heading span { color:var(--ink); font-size:11px; font-weight:700; text-align:right; }
    .detail-card p { margin:5px 0; font-size:11px; }
    .formula { padding:7px 9px; border-left:3px solid var(--cyan); background:var(--soft); font:11px/1.5 Consolas,"Courier New",monospace; overflow-wrap:anywhere; }
    .detail-label { color:var(--muted); }
    .detail-card ul { margin:5px 0 5px 18px; padding:0; color:var(--muted); font-size:10px; }
    .detail-notes,.issue-warning { color:var(--warning)!important; }
    .issue-error { color:var(--danger); }
    .issue-info { color:var(--muted); }
    .issues { margin:0; padding-left:20px; }
    .issues li { margin:4px 0; }
    .scope-note { padding:12px 14px; border:1px solid #d6e8ed; border-radius:5px; background:#f0f8fa; color:#34515f; font-size:11px; }
    .report-footer { display:flex; justify-content:space-between; gap:16px; margin-top:32px; padding-top:12px; border-top:1px solid var(--line); color:var(--muted); font-size:10px; }
    .report-footer strong { color:var(--ink); }
    .actions { position:sticky; top:0; z-index:2; display:flex; justify-content:center; gap:10px; padding:12px; background:#09202d; }
    button { min-height:40px; padding:0 18px; border:1px solid #00c7d9; border-radius:5px; background:#00aebf; color:white; font:600 13px "Segoe UI",Arial,sans-serif; cursor:pointer; }
    button.secondary { border-color:#69808d; background:#193543; }
    @media (max-width:700px) { .page { margin:0 auto; padding:25px 20px; } .summary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .two-col { grid-template-columns:1fr; } .report-header { align-items:flex-start; } .brand img { width:132px; height:58px; } .header-meta { font-size:10px; } h1 { font-size:25px; } .data-table { font-size:11px; } th,td { padding:6px; } }
    @page { size:auto; margin:15mm 14mm 16mm; }
    @media print {
      body { background:#fff; font-size:10pt; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .page { width:auto; margin:0; padding:0; box-shadow:none; }
      .actions { display:none!important; }
      .report-header { break-inside:avoid; }
      .report-title,.status-banner,.section-heading { break-after:avoid; }
      .report-section { margin-top:20px; }
      .detail-card,.info-card,figure,.summary-card { break-inside:avoid; }
      table { break-inside:auto; }
      tr { break-inside:avoid; }
      thead { display:table-header-group; }
      .report-footer { break-inside:avoid; }
      a { color:inherit; text-decoration:none; }
    }
  </style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Print / Save as PDF</button><button class="secondary" onclick="window.close()">Close report</button></div>
  <main class="page">
    <header class="report-header">
      <div class="brand"><img src="${escapeHtml(options.logoUrl)}" alt="HX Studio logo" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="brand-fallback">HX Studio</span></div>
      <div class="header-meta"><strong>ENGINEERING REPORT</strong>Generated ${escapeHtml(generatedAt)}<br>Prepared with HX Studio</div>
    </header>
    <div class="report-title"><p class="eyebrow">Thermal and hydraulic assessment</p><h1>${escapeHtml(configurationName)} exchanger</h1><p class="subtitle">${escapeHtml(flowName)} · ${escapeHtml(input.mode)} mode · SI units</p></div>
    <div class="status-banner">${evaluation.ok ? "✓" : "!"} ${escapeHtml(statusText)}${state ? ` · ${state.iterations} solver iteration${state.iterations === 1 ? "" : "s"}` : ""}</div>
    <section class="summary-grid" aria-label="Key engineering results">
      ${summaryCard("Heat transfer rate", byId("Q"))}
      ${summaryCard("Effectiveness", byId("eps"))}
      ${summaryCard("Log-mean ΔT", byId("LMTD"))}
      ${summaryCard("Required area", byId("A"))}
    </section>

    <section class="report-section">
      <div class="section-heading"><span class="section-index">01</span><div><h2>Design basis</h2><p>Configuration and operating conditions used for this evaluation.</p></div></div>
      <div class="two-col">
        <article class="info-card"><h3>Exchanger geometry</h3><table class="property-table">
          <tr><td>Type / arrangement</td><td>${escapeHtml(configurationName)} · ${escapeHtml(flowName)}</td></tr>
          <tr><td>Tube length / count</td><td>${escapeHtml(geometry.L)} m · ${escapeHtml(geometry.Nt)}</td></tr>
          <tr><td>Tube ID / wall thickness</td><td>${escapeHtml(geometry.di)} m · ${escapeHtml(geometry.t)} m</td></tr>
          <tr><td>Shell / outer-pipe ID</td><td>${escapeHtml(geometry.Ds)} m</td></tr>
          <tr><td>Tube passes / shell passes</td><td>${escapeHtml(geometry.tubePasses)} / ${escapeHtml(geometry.shellPasses)}</td></tr>
          <tr><td>Tube pitch / arrangement</td><td>${escapeHtml(geometry.pitch)} m · ${escapeHtml(geometry.arrangement)}</td></tr>
          <tr><td>Baffle spacing / cut</td><td>${escapeHtml(geometry.baffleSpacing)} m · ${escapeHtml(geometry.baffleCut)}</td></tr>
          <tr><td>Tube-side stream</td><td>${escapeHtml(geometry.tubeSideStream)}</td></tr>
        </table></article>
        <article class="info-card"><h3>Operating conditions</h3><table class="property-table">
          <tr><td>Calculation mode</td><td>${escapeHtml(input.mode)}</td></tr>
          <tr><td>Selected correlation</td><td>${escapeHtml(operating.correlation)}</td></tr>
          <tr><td>Wall conductivity</td><td>${escapeHtml(geometry.kw)} W/m·K</td></tr>
          <tr><td>Inside / outside fouling</td><td>${escapeHtml(operating.Rfi)} / ${escapeHtml(operating.Rfo)} m²·K/W</td></tr>
          <tr><td>Pump efficiency</td><td>${(operating.pumpEfficiency * 100).toFixed(1)}%</td></tr>
          <tr><td>Energy-balance tolerance</td><td>${(operating.energyBalanceTolerance * 100).toFixed(2)}%</td></tr>
          ${input.specifiedQ !== undefined ? `<tr><td>Specified duty</td><td>${escapeHtml(formatValue(input.specifiedQ, "W"))}</td></tr>` : ""}
        </table></article>
      </div>
    </section>

    <section class="report-section">
      <div class="section-heading"><span class="section-index">02</span><div><h2>Stream conditions and properties</h2><p>Inlet/outlet conditions and properties evaluated by the solver.</p></div></div>
      <div class="two-col">
        <article class="info-card"><h3>Stream conditions</h3><table class="data-table"><thead><tr><th>Stream</th><th>Fluid</th><th>Inlet</th><th>Outlet</th><th>Flow</th><th>Pressure</th></tr></thead><tbody>
          <tr><td>Hot</td><td>${escapeHtml(hot.label)}</td><td>${escapeHtml(hot.Tin)} °C</td><td>${escapeHtml(state?.ThOut.toFixed(2) ?? hot.Tout ?? "—")} °C</td><td>${escapeHtml(hot.mdot)} kg/s</td><td>${escapeHtml(formatValue(hot.pressure, "Pa"))}</td></tr>
          <tr><td>Cold</td><td>${escapeHtml(cold.label)}</td><td>${escapeHtml(cold.Tin)} °C</td><td>${escapeHtml(state?.TcOut.toFixed(2) ?? cold.Tout ?? "—")} °C</td><td>${escapeHtml(cold.mdot)} kg/s</td><td>${escapeHtml(formatValue(cold.pressure, "Pa"))}</td></tr>
        </tbody></table></article>
        <article class="info-card"><h3>Evaluation-temperature properties</h3><table class="data-table"><thead><tr><th>Stream</th><th>ρ kg/m³</th><th>Cp J/kg·K</th><th>μ Pa·s</th><th>k W/m·K</th></tr></thead><tbody>
          <tr><td>Hot</td><td>${escapeHtml(state?.propsHot.rho.toPrecision(5))}</td><td>${escapeHtml(state?.propsHot.cp.toPrecision(5))}</td><td>${escapeHtml(state?.propsHot.mu.toExponential(3))}</td><td>${escapeHtml(state?.propsHot.k.toPrecision(5))}</td></tr>
          <tr><td>Cold</td><td>${escapeHtml(state?.propsCold.rho.toPrecision(5))}</td><td>${escapeHtml(state?.propsCold.cp.toPrecision(5))}</td><td>${escapeHtml(state?.propsCold.mu.toExponential(3))}</td><td>${escapeHtml(state?.propsCold.k.toPrecision(5))}</td></tr>
        </tbody></table></article>
      </div>
    </section>

    <section class="report-section">
      <div class="section-heading"><span class="section-index">03</span><div><h2>Engineering results</h2><p>Calculated values and solver status. Expand the next section for equations and assumptions.</p></div></div>
      <table class="data-table"><thead><tr><th>Parameter</th><th>Result</th><th>Status</th></tr></thead><tbody>${parameters.map(renderParameterRow).join("")}</tbody></table>
    </section>

    ${modelSection}

    <section class="report-section">
      <div class="section-heading"><span class="section-index">05</span><div><h2>Temperature profile</h2><p>Sampled bulk-fluid temperatures along normalized exchanger length.</p></div></div>
      <table class="data-table profile-table"><thead><tr><th>Normalized length</th><th>Hot bulk temperature</th><th>Cold bulk temperature</th></tr></thead><tbody>${profileRows}</tbody></table>
      <p class="detail-label">Profile data describes the solver’s one-dimensional bulk-temperature model; it is not a local CFD field.</p>
    </section>

    <section class="report-section">
      <div class="section-heading"><span class="section-index">06</span><div><h2>Calculation details</h2><p>Equations, inputs, assumptions and notes for each reported parameter.</p></div></div>
      ${parameters.map(renderCalculationDetail).join("")}
    </section>

    <section class="report-section">
      <div class="section-heading"><span class="section-index">07</span><div><h2>Warnings and engineering scope</h2><p>Review these items before using the results for engineering decisions.</p></div></div>
      <ul class="issues">${issueRows}</ul>
      <p class="scope-note"><strong>Model scope:</strong> Results are preliminary correlation-based estimates. Shell-side heat transfer and pressure drop use the Kern method where applicable. Temperature profiles are one-dimensional bulk estimates. The visualization is not CFD, and this report is not a certified or code-compliant mechanical design.</p>
    </section>
    <footer class="report-footer"><span><strong>HX Studio</strong> · Local engineering analysis</span><span>Generated ${escapeHtml(generatedAt)} · Verify assumptions and input data before use</span></footer>
  </main>
</body>
</html>`;
}

export function openEngineeringReport(input: ExchangerInput, evaluation: Evaluation): void {
  let modelImage: string | undefined;
  try {
    const canvas = document.querySelector("canvas");
    modelImage = canvas?.toDataURL("image/png");
  } catch {
    // A screenshot is optional; report content and logo remain available if canvas capture is blocked.
  }

  const popup = window.open("", "_blank", "width=1100,height=900");
  if (!popup) {
    window.alert("Allow the report window to open, then choose Print / Save as PDF.");
    return;
  }

  const logoUrl = new URL("/hx-studio-logo.png", window.location.href).href;
  popup.document.open();
  popup.document.write(createEngineeringReportHtml(input, evaluation, { logoUrl, modelImage }));
  popup.document.close();
}
