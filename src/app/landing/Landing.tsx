import { lazy, Suspense, type ReactNode } from "react";

const HeroExchanger = lazy(() => import("./HeroExchanger").then(m => ({ default: m.HeroExchanger })));

function Icon({ name, size = 27 }: { name: string; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const shapes: Record<string, ReactNode> = {
    cube: <><path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5"/></>,
    calc: <><rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6h8v3H8zM8 13h1m3 0h1m3 0h1M8 17h1m3 0h1m3 0h1"/></>,
    flow: <><path d="M3 7h17l-4-4m4 4-4 4M21 17H4l4 4m-4-4 4-4"/></>,
    chart: <><path d="M3 20h19M5 17v-5h3v5m3 0V8h3v9m3 0V4h3v13"/><path d="m4 9 5-4 4 2 7-5"/></>,
    devices: <><rect x="2" y="3" width="15" height="12" rx="1.5"/><path d="M6 19h7m-3.5-4v4M19 9h4v11h-7V9z"/></>,
    play: <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>{shapes[name] ?? null}</svg>;
}

const features = [
  { icon: "cube", title: "Interactive 3D Geometry", description: "Explore parametric exchanger models." },
  { icon: "calc", title: "15 Engineering Parameters", description: "Traceable thermal and hydraulic results." },
  { icon: "flow", title: "Parallel & Counter Flow", description: "Compare practical flow arrangements." },
  { icon: "chart", title: "Performance Analysis", description: "Inspect profiles and sensitivity trends." },
  { icon: "devices", title: "Fully Responsive", description: "Mobile · Tablet · Desktop" },
];

export function LandingPage({ onLaunch, reducedMotion }: { onLaunch: () => void; reducedMotion: boolean }) {
  return <main className="landing-main">
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="hero-copy">
        <h1 id="landing-title"><span>HX</span> Studio</h1>
        <p className="hero-subtitle">3D Heat Exchanger Design &amp; Simulation</p>
        <div className="hero-rule" aria-hidden="true" />
        <p className="hero-description">Configure heat exchangers. Calculate thermal performance. Explore fluid flow through interactive 3D engineering models.</p>
      </div>
      <div className="hero-model-wrap"><Suspense fallback={<div className="hero-webgl-fallback" aria-label="Loading 3D heat exchanger">Loading interactive 3D model…</div>}><HeroExchanger reducedMotion={reducedMotion}/></Suspense></div>
      <div className="hero-cta-wrap"><button type="button" className="launch-button" onClick={onLaunch}><Icon name="play" size={23}/><span>Launch Simulator</span><span className="launch-arrow" aria-hidden="true">→</span></button></div>
    </section>
    <section className="landing-features" aria-label="HX Studio capabilities">
      {features.map((feature, i) => <div key={feature.title} className={`landing-feature ${i === 4 ? "feature-last" : ""}`}>
        <div className="feature-icon"><Icon name={feature.icon} size={39}/></div>
        <div><h2>{feature.title}</h2><p>{feature.description}</p></div>
      </div>)}
    </section>
    <footer className="landing-footer"><span aria-hidden="true"/><p>Built by Asmodeus</p><span aria-hidden="true"/></footer>
  </main>;
}
