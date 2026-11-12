/** Flow-direction arrow and calculated-temperature label at a nozzle / open pipe end. */
import { useMemo } from "react";
import * as THREE from "three";
import type { Evaluation } from "../../simulation/solvers/exchangerSolver";
import type { GeometryInput } from "../../engineering/types";
import { useView } from "../../state/viewStore";
import { dimsOf, type NozzlePlacement } from "../geometries/layout";
import { STREAM_COLORS } from "../visualizations/thermalField";
import { SceneLabel } from "./labels";

export function NozzleMarkers({ n, g, ev }: { n: NozzlePlacement; g: GeometryInput; ev: Evaluation }) {
  const showFlow = useView((s) => s.showFlow);
  const showTemps = useView((s) => s.showTempLabels);
  const d = dimsOf(g);
  const out = new THREE.Vector3(...n.outward);
  const flow = n.role === "in" ? out.clone().negate() : out.clone();
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), flow.clone().normalize()), [flow.x, flow.y, flow.z]); // eslint-disable-line react-hooks/exhaustive-deps
  const reach = (n.drawn ? d.nozzleLen : 0) + 0.11;
  const tip = new THREE.Vector3(...n.base).addScaledVector(out, reach);
  const label = new THREE.Vector3(...n.base).addScaledVector(out, reach + 0.12);
  const s = ev.state;
  const T = s ? (n.stream === "hot" ? (n.role === "in" ? s.ThIn : s.ThOut) : n.role === "in" ? s.TcIn : s.TcOut) : null;
  const color = STREAM_COLORS[n.stream];
  return (
    <>
      {showFlow ? (
        <mesh position={tip} quaternion={quat}>
          <coneGeometry args={[0.032, 0.09, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ) : null}
      {showTemps && T !== null ? (
        <SceneLabel
          id={`temp-${n.id}`}
          position={label.toArray() as [number, number, number]}
          kind="temp"
          title={`${n.stream === "hot" ? "Hot" : "Cold"} ${n.role}`}
          value={`${T.toFixed(1)} °C`}
          color={color}
        />
      ) : null}
    </>
  );
}
