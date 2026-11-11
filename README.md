# HX Studio — engine-first build (Phase 1 foundations + Phase 2)

Browser-based 3D heat exchanger design & simulation platform. This drop delivers the
**calculation engine, fluid library, unit system, validation, temperature-profile solver and design-mode
sizing**, fully tested. The React/Three.js/Tailwind interface, 3D geometry, charts and reporting are **not
built yet** (Phases 3–7 of the spec); dependencies for them are already installed.

```
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest, 99 tests
```

## Implementation assessment

| Spec area | Status |
|---|---|
| Repo inspection | Workspace was empty — greenfield |
| Phase 1: architecture, units, sample configuration, validation | Done (no UI/state stores yet) |
| Phase 2: all 15 parameters, parallel/counter/multipass relations, fluid library, tests | Done |
| Design-mode sizing (solve L, Nt or di) | Done (`simulation/solvers/sizing.ts`) |
| Temperature profiles (numerical, RK4) | Done (engine side) |
| Phase 3–4: Three.js geometry, flow/thermal visualisation | Not started |
| Phase 5: responsive UI, landing page ("Built by Asmodeus") | Not started |
| Phase 6: performance charts/sensitivity UI | Not started (engine supports re-evaluation) |
| Phase 7: PDF/CSV/JSON reporting | Not started |

## Engineering methods

- **Internal units**: SI, °C for temperature (differences identical to K). Display conversion is separate
  (`engineering/units`), with distinct absolute vs. delta temperature conversion.
- **Rating mode**: outlets solved with ε–NTU; fluid properties iterated at mean bulk temperature.
  **Duty mode**: both outlets specified; hot/cold balances compared and the discrepancy reported;
  LMTD/F → required vs. available area.
- **Flow arrangement** is a real configuration: it selects the LMTD terminal differences, the ε–NTU relation,
  and the temperature-profile boundary conditions. Multipass shell-and-tube (even tube passes, N shell
  passes) uses the shell-and-tube ε–NTU relations; F is derived from ε–NTU and cross-checked against the
  Bowman closed form (exact agreement for one shell). The `flow` flag is ignored for multipass units.
- **Correlations**: Hausen (laminar), Gnielinski (turbulent, auto), Dittus–Boelter, Sieder–Tate (user
  selectable, validity-checked), transitional band flagged as indicative; Kern shell-side Nu and ΔP;
  Haaland/Darcy tube friction with Sinnott minor-loss heads; annulus via hydraulic diameter.
- **Temperature profile**: 1-D bulk energy balance, RK4, counterflow BVP solved by exact linear shooting.
  Multipass units show an *equivalent counterflow* profile (flagged), not a resolved pass-by-pass profile.
  This is not CFD.

## Known limitations (read before relying on results)

1. **Fluid library**: water (0–150 °C), air (250–600 K, ideal-gas density), pure ethylene glycol
   (273–373 K). Values were entered from textbook tables and should be re-verified against the cited
   sources before real use. Propylene glycol, thermal oils and steam are **not** included — enter manually.
   Water is treated as liquid; no pressure/saturation check yet.
2. **Shell side is Kern, preliminary**: no leakage/bypass/window corrections (Bell–Delaware is the next step).
   Nozzle losses excluded. Wall-viscosity correction taken as 1.
3. **Annulus (double-pipe)** uses Dh = D₂ − D₁ for Re, f and Nu — an approximation.
4. **Only even tube-pass counts** are supported for multipass; odd counts are rejected, not approximated.
5. Tube-count/bundle fit is an approximate area screen, not a layout count.
6. Fouling is a user input (not predicted). One overall pump efficiency for both circuits.
7. Sizing solves one variable at a time by bisection; non-monotonic cases return `no_bracket`.

## Layout

```
src/engineering/   types, units, properties, correlations, calculations, validation, sample config
src/simulation/    solvers (main solver + sizing), temperatureProfiles
src/tests/         calculations, integration, validation
```
