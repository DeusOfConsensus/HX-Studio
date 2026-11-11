# HX Studio

Browser-based heat exchanger workbench built with React, TypeScript and Three.js.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Create a production bundle with `npm run build`. Run the engineering calculation checks with `npm test`.

## Current implementation

- Parametric shell-and-tube and double-pipe visual geometry, orbit/zoom controls, animated flow markers, selectable parallel/counter-current arrangement, and pause/quality controls.
- Editable hot and cold stream properties and primary geometry inputs.
- Local JSON project import/export and engineering results CSV export.
- Thermal resistance network, ideal single-pass LMTD and effectiveness–NTU calculations, tube-side Reynolds/Nusselt/Prandtl estimates, preliminary shell-side estimates, pressure drop and pump power.
- Responsive workbench and calculated endpoint temperature profile visualization.

## Engineering scope and limits

This is an early engineering prototype, not a certified equipment rating tool. Properties are entered manually. The shell-side hydraulic model and convection correlations are preliminary. The idealized LMTD and effectiveness–NTU calculations do not yet apply multipass correction factors. It does not implement Bell–Delaware, a verified property package, design optimization, CFD, a full sensitivity sweep, or PDF reporting. Confirm all assumptions and results against validated references before engineering use.
