import { useView, type ViewName } from "../state/viewStore";
import type { ComponentInfo } from "../three/geometries/layout";
import { Toggle } from "./ui";

export function ViewToolbar() {
  const goView = useView((s) => s.goView);
  const running = useView((s) => s.running);
  const setView = useView((s) => s.setView);
  const zoomBy = useView((s) => s.zoomBy);
  const views: Array<[ViewName, string]> = [["iso", "Isometric"], ["front", "Front"], ["side", "Side"], ["top", "Top"], ["fit", "Fit"]];
  return (
    <div className="flex flex-wrap items-center gap-1 border-b p-2" style={{ borderColor: "var(--border)", background: "var(--sidebar)" }} role="toolbar" aria-label="3D view controls">
      <button type="button" className="hx-btn hx-btn-primary" onClick={() => setView({ running: !running })} aria-label={running ? "Pause simulation" : "Resume simulation"}>
        {running ? "❚❚ Pause" : "▶ Resume"}
      </button>
      <span className="mx-1 hidden h-6 border-l sm:block" style={{ borderColor: "var(--border)" }} aria-hidden="true" />
      <div className="flex items-center gap-1" role="group" aria-label="Zoom simulator view">
        <button type="button" className="hx-btn min-w-10 text-lg font-semibold leading-none" onClick={() => zoomBy(0.82)} aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" className="hx-btn min-w-10 text-lg font-semibold leading-none" onClick={() => zoomBy(1 / 0.82)} aria-label="Zoom out" title="Zoom out">−</button>
      </div>
      {views.map(([k, l]) => (
        <button key={k} type="button" className="hx-btn" onClick={() => goView(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="hx-label flex justify-between">
        <span>{label}</span>
        <span>
          {suffix === "%" ? Math.round(value * 100) : value.toFixed(2)}
          {suffix}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

export function DisplayPanel({ components }: { components: ComponentInfo[] }) {
  const s = useView();
  return (
    <div className="@container p-3"><div className="grid gap-3 @md:grid-cols-2">
      <div className="hx-panel p-3">
        <div className="mb-2 text-[13px] font-semibold tracking-wide">SIMULATION</div>
        <Slider label="Speed (× real velocity)" value={s.speed} min={0.1} max={6} step={0.1} onChange={(v) => s.setView({ speed: v })} suffix="×" />
        <Slider label="Particle density" value={s.density} min={0.1} max={1} step={0.05} onChange={(v) => s.setView({ density: v })} suffix="%" />
        <div className="mt-2 flex flex-wrap gap-1">
          <Toggle label="Flow" on={s.showFlow} onClick={() => s.setView({ showFlow: !s.showFlow })} />
          <Toggle label="Thermal colours" on={s.showThermal} onClick={() => s.setView({ showThermal: !s.showThermal })} />
          <Toggle label="Temp labels" on={s.showTempLabels} onClick={() => s.setView({ showTempLabels: !s.showTempLabels })} />
          <Toggle label="Part names" on={s.showNames} onClick={() => s.setView({ showNames: !s.showNames })} />
          <Toggle label="Low quality" on={s.quality === "low"} onClick={() => s.setView({ quality: s.quality === "low" ? "high" : "low" })} />
        </div>
      </div>
      <div className="hx-panel p-3">
        <div className="mb-2 text-[13px] font-semibold tracking-wide">INSPECTION</div>
        <Slider label="Exploded view" value={s.explode} min={0} max={1} step={0.01} onChange={(v) => s.setView({ explode: v })} suffix="%" />
        <Slider label="Shell transparency (opacity)" value={s.shellOpacity} min={0.05} max={1} step={0.05} onChange={(v) => s.setView({ shellOpacity: v })} suffix="%" />
        <div className="mt-1 flex items-center gap-2">
          <Toggle label="Cross-section" on={s.clipOn} onClick={() => s.setView({ clipOn: !s.clipOn })} />
        </div>
        <Slider label="Section plane position" value={s.clipPos} min={-1} max={1} step={0.02} onChange={(v) => s.setView({ clipPos: v, clipOn: true })} />
      </div>
      <div className="hx-panel p-3 @md:col-span-2">
        <div className="mb-2 text-[13px] font-semibold tracking-wide">COMPONENTS</div>
        <ul className="grid gap-1 @lg:grid-cols-2 @lg:gap-x-3">
          {components.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              <button type="button" className="hx-btn min-w-0 flex-1 truncate text-left" aria-pressed={s.selected === c.id} onClick={() => s.select(s.selected === c.id ? null : c.id)} title={c.dims}>
                {c.name}
              </button>
              <button type="button" className="hx-btn" aria-label={`${s.hidden[c.id] ? "Show" : "Hide"} ${c.name}`} aria-pressed={!!s.hidden[c.id]} onClick={() => s.toggleHidden(c.id)}>
                {s.hidden[c.id] ? "Show" : "Hide"}
              </button>
              <button type="button" className="hx-btn" aria-label={`Isolate ${c.name}`} aria-pressed={s.isolated === c.id} onClick={() => s.setIsolated(s.isolated === c.id ? null : c.id)}>
                Isolate
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div></div>
  );
}
