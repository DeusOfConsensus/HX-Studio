# HX Studio — local engineering simulator (integrated first release, with documented limits)

Browser-based 3D heat exchanger design and simulation platform. The app integrates a local engineering
solver, parametric shell-and-tube and double-pipe geometry, flow and thermal visualization, responsive
workspaces, performance charts, design sizing, and local project/result export. Simplified correlation-based
results are intended for preliminary analysis and learning, not certification or detailed industrial design.

```
npm install
npm run dev         # open the 3D simulator
npm run typecheck   # tsc --noEmit
npm test            # Vitest unit, integration and analytic benchmark checks
npm run build
```

## Implementation assessment

| Spec area | Status |
|---|---|
| Repository assessment | Existing React/TypeScript/Vite app, engineering engine, R3F scenes and 137 tests preserved and extended |
| Inputs and validation | Local sample configs, fluid library/manual properties, rating and duty modes, validation and units |
| Engineering calculations | 15 traceable results; parallel, counter and multipass shell-and-tube methods |
| Design sizing | One variable at a time (L, Nt or di) in duty mode; solver re-runs at each trial |
| Parametric 3D | Shell-and-tube and double-pipe; camera, selection, exploded view, section plane, hide/isolate |
| Flow and thermal visualization | Directions and particle animation use selected configuration and calculated velocity; temperature bands derive from 1-D profiles |
| App workspaces | Overview, 3D Simulator, Engineering Calculator, Performance Analysis and Documentation; Geometry Designer was removed as a duplicate |
| Performance analysis | Temperature profile, sensitivity (nine inputs), duty/effectiveness, pressure drop, Reynolds, resistance and effectiveness–NTU charts |
| Local reports and files | JSON save/load, CSV results export, print-to-PDF report with model screenshot when browser capture is available |
| Responsive interface | Responsive stacked, two-column and three-column layouts; keyboard focus, reduced motion and touch-sized controls. Physical touch devices are not formally verified. |

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
5. Tube-count fit is a geometric lattice count (one fixed orientation, tubes nearest the axis first); it ignores TEMA pass-partition lanes and tie rods, so real multipass counts are lower.
6. Fouling is a user input (not predicted). One overall pump efficiency for both circuits.
7. Sizing solves one variable at a time by bisection; non-monotonic cases return `no_bracket`.

## Verification scope

The analytic benchmark suite checks fixed reference values for parallel- and counterflow ε–NTU
effectiveness (including the equal-capacity-rate limit), LMTD, and a simple heat-capacity energy
balance. Expected values are fixed in the tests rather than calculated by calling the implementation
under test. These are equation-level regression checks; they do **not** validate the complete solver
against plant data or independently validate empirical heat-transfer and pressure-drop correlations.
In particular, shell-side results remain preliminary Kern estimates until benchmark cases are added
against independently sourced data for realistic baffled exchangers.

## Workflows and exports

- **Rating** predicts outlet temperatures from geometry and inlet conditions. **Duty** accepts both outlet
  temperatures and displays the energy-balance discrepancy. Design sizing explicitly solves one selected
  dimension; other values remain fixed. Unsupported or underdetermined inputs produce an error instead of a guessed result.
- **Overview** is the lightweight landing page and carries the “Built by Asmodeus” attribution.
  **Engineering Calculator** is where users enter and validate inputs. **3D Simulator** is where they inspect
  the model, simulation controls, status, and engineering results. **Performance Analysis** reruns the solver
  across selected input changes. The former Geometry Designer was removed because it duplicated calculator inputs.
- **Save JSON / Load JSON** store project configuration locally. **Export CSV** exports parameter values and
  formulas. **Report / PDF** opens a print-ready local report; choose “Save as PDF” in the browser print dialog.

## 3D notes

- The landing preview and simulator now share `three/scenes/ExchangerAssembly.tsx`, which composes the same
  `ExchangerModel` and solver-driven `FlowLayer`. Home supplies the preset `sampleConfiguration`; the
  simulator supplies the active, editable configuration. Presentation state is restored on leaving Home.
- The brand in the shared navigation uses the provided `/hx-studio-logo.png` asset across Home, Simulator,
  Documentation and About.

- `three/geometries/layout.ts` is three.js-free and defines tube lattice, pass bands, baffle stations,
  nozzle placement and the flow plan. The scene, validation and tests all use it, so drawing and calculation share
  one source of truth (tube capacity lives in `engineering/calculations/tubeCount.ts`).
- If `Nt` exceeds what fits in the shell, calculations still use `Nt`, a `BUNDLE_FIT` warning is raised and the
  3D model draws only the tubes that fit. Above 600 tubes the drawing is capped (stated in the UI).
- Multipass shell-and-tube is drawn as a nominal overall-counter-current arrangement (flagged); the
  parallel/counter selector is disabled for it, matching the solver.
- Labels use a custom overlay (`three/scenes/labels.tsx`) because drei `<Html>` dropped a label and threw
  `removeChild` errors on unmount.
- The sample's tube count was reduced from 40 to 32: 40 tubes did not physically fit a 203 mm shell.

## Engineering scope and roadmap

The current shell-side Kern method is explicitly preliminary. The next engineering step is to add
independently sourced shell-and-tube benchmark cases, then implement and compare a correction-based method
such as Bell–Delaware, including its leakage, bypass, and baffle-window corrections. Keep methods and
assumptions selectable and visible so a more detailed model does not silently change existing results.

Mechanical pressure-vessel design is a separate future scope. It would need an explicitly selected code
edition, applicable material and fabrication rules, and qualified engineering review; thermal/hydraulic
benchmark coverage alone does not make a mechanical design module suitable for construction. [ASME BPVC
Section VIII](https://www.asme.org/codes-standards/find-codes-standards/bpvc-viii-1-bpvc-section-viii-rules-construction-pressure-vessels-division-1)
covers pressure-vessel construction, inspection, testing, and certification, while [TEMA publishes
separate shell-and-tube exchanger standards](https://tema.org/standards/). Confirm the governing editions
when that work begins.

## Known 3D limitations

- Rear head can leave the frame at high explode values; press **Fit**.
- Baffles have no tube holes; tube particles are sampled from at most 14 tubes; shell particles avoid tubes.
- Colours/particles depict a 1-D bulk model, not CFD. Wall temperatures are deliberately not drawn.
- Not yet tested on real touch devices or with a physical GPU (checked in headless Chromium/SwiftShader).

## Layout

```
src/engineering/   types, units, properties, correlations, calculations, validation, sample config
src/simulation/    solvers (main solver + sizing), temperatureProfiles
src/three/         geometries/layout (pure), scenes (R3F), visualizations/thermalField
src/state/         viewStore (zustand)
src/app/           workspace UI (inputs, results, view controls)
src/tests/         calculations, integration, validation
```
