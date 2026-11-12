import { useState, type ReactNode } from "react";
import type { SiteRoute } from "./routes";

const routePath: Record<SiteRoute, string> = { Home: "/", Simulator: "/simulator", Documentation: "/documentation", About: "/about" };
function Icon({ name, size = 23 }: { name: string; size?: number }) {
  const shapes: Record<string, ReactNode> = {
    gear: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.6a8 8 0 0 1-1.4.8l-.3 1.8h-3l-.3-1.8a8 8 0 0 1-1.4-.8l-1.7.6-1.5-2.6 1.4-1.1a7 7 0 0 1 0-1.7l-1.4-1.1 1.5-2.6 1.7.6a8 8 0 0 1 1.4-.8l.3-1.8h3l.3 1.8a8 8 0 0 1 1.4.8l1.7-.6 1.5 2.6-1.4 1.1a7 7 0 0 1 0 1.7Z" transform="translate(-1 -1) scale(1.08)"/></>,
    menu: <><path d="M3 6h18M3 12h18M3 18h18"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

export function BrandMark() {
  return <a className="hx-brand" href="/" aria-label="HX Studio home">
    <img className="hx-brand-logo" src="/hx-studio-logo.png" alt="HX Studio" width="2135" height="736" />
  </a>;
}

export function SiteNav({ active, onNavigate, reducedMotion, onReducedMotionChange }: {
  active: SiteRoute; onNavigate: (route: SiteRoute) => void; reducedMotion: boolean; onReducedMotionChange: (value: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navLinks: SiteRoute[] = ["Home", "Simulator", "Documentation", "About"];
  const go = (route: SiteRoute) => { onNavigate(route); setMenuOpen(false); setSettingsOpen(false); };
  return <header className="site-header">
    <BrandMark/><span className="site-brand-divider" aria-hidden="true"/>
    <nav className="desktop-nav" aria-label="Main navigation">{navLinks.map(link => <a key={link} href={routePath[link]} aria-current={active === link ? "page" : undefined} className={`site-nav-link ${active === link ? "active" : ""}`} onClick={e => { e.preventDefault(); go(link); }}>{link}</a>)}</nav>
    <div className="nav-actions">
      <button className="settings-trigger" aria-label="Display settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(v => !v)}><Icon name="gear"/></button>
      <button className="menu-trigger" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="mobile-primary-navigation" onClick={() => { setMenuOpen(v => !v); setSettingsOpen(false); }}><Icon name={menuOpen ? "close" : "menu"} size={29}/></button>
    </div>
    {menuOpen ? <nav id="mobile-primary-navigation" className="mobile-nav" aria-label="Mobile navigation">
      {navLinks.map(link => <a key={link} href={routePath[link]} aria-current={active === link ? "page" : undefined} className={`site-nav-link ${active === link ? "active" : ""}`} onClick={e => { e.preventDefault(); go(link); }}>{link}</a>)}
      <button className="mobile-settings" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}><Icon name="gear" size={20}/> Display settings</button>
    </nav> : null}
    {settingsOpen ? <div className="settings-popover" role="dialog" aria-label="Display settings">
      <div className="settings-title">Display settings</div>
      <label className="settings-option"><input type="checkbox" checked={reducedMotion} onChange={e => onReducedMotionChange(e.target.checked)}/><span>Reduce motion and pause flow particles</span></label>
      <p>Also follows your device’s reduced-motion setting by default.</p>
    </div> : null}
  </header>;
}
