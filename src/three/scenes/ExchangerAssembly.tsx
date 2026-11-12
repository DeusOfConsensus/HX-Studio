import type { Evaluation } from "../../simulation/solvers/exchangerSolver";
import type { GeometryInput } from "../../engineering/types";
import type { TubeLayout } from "../geometries/layout";
import { ExchangerModel } from "./ExchangerModel";
import { FlowLayer } from "./FlowLayer";

/** Shared geometry + solver-driven flow assembly used by both presentation and simulator viewports. */
export function ExchangerAssembly({ g, layout, ev }: { g: GeometryInput; layout: TubeLayout; ev: Evaluation }) {
  return <group position={[-g.L / 2, 0, 0]}>
    <ExchangerModel g={g} layout={layout} ev={ev}/>
    <FlowLayer g={g} layout={layout} ev={ev}/>
  </group>;
}
