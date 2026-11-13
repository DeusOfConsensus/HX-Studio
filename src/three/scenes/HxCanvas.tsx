import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Evaluation } from "../../simulation/solvers/exchangerSolver";
import type { GeometryInput } from "../../engineering/types";
import { useView } from "../../state/viewStore";
import { dimsOf, type TubeLayout } from "../geometries/layout";
import { ExchangerAssembly } from "./ExchangerAssembly";
import { LabelProjector } from "./labels";

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

const DIRS: Record<string, [number, number, number]> = {
  iso: [0.75, 0.55, 1],
  front: [0, 0, 1],
  side: [1, 0, 0],
  top: [0, 1, 0.0001],
};

function CameraRig({ g }: { g: GeometryInput }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const invalidate = useThree((s) => s.invalidate);
  const cmd = useView((s) => s.viewCmd);
  const zoomCmd = useView((s) => s.zoomCmd);
  const done = useRef(-1);
  const zoomDone = useRef(-1);
  useEffect(() => {
    if (!controls || done.current === cmd.n) return;
    done.current = cmd.n;
    const d = dimsOf(g);
    const R = Math.hypot(g.L / 2 + d.headLen + 0.35, d.Rs + 0.3);
    // fit the bounding sphere into the tighter of the vertical / horizontal fields of view
    const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = (R / Math.sin(Math.min(vHalf, hHalf))) * 0.72;
    const dir =
      cmd.name === "fit"
        ? camera.position.clone().sub(controls.target).normalize()
        : new THREE.Vector3(...DIRS[cmd.name]).normalize();
    controls.target.set(0, 0, 0);
    camera.position.copy(dir.multiplyScalar(dist));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    controls.update();
    invalidate();
  }, [cmd, controls, camera, g, invalidate]);

  useEffect(() => {
    if (!controls || zoomDone.current === zoomCmd.n) return;
    zoomDone.current = zoomCmd.n;

    const offset = camera.position.clone().sub(controls.target);
    const distance = offset.length();
    if (distance === 0) return;

    // Dolly along the current viewing vector so zooming preserves the user's orbit angle.
    const nextDistance = THREE.MathUtils.clamp(distance * zoomCmd.factor, 0.3, 40);
    camera.position.copy(controls.target).add(offset.multiplyScalar(nextDistance / distance));
    controls.update();
    invalidate();
  }, [zoomCmd, controls, camera, invalidate]);
  return null;
}

export function HxCanvas({ g, layout, ev }: { g: GeometryInput; layout: TubeLayout; ev: Evaluation }) {
  const running = useView((s) => s.running);
  const quality = useView((s) => s.quality);
  const select = useView((s) => s.select);
  return (
    <Canvas
      frameloop={running ? "always" : "demand"}
      dpr={quality === "low" ? 1 : [1, 1.75]}
      camera={{ fov: 40, near: 0.01, far: 200, position: [3, 2, 3] }}
      gl={{ antialias: quality === "high", preserveDrawingBuffer: true, powerPreference: "high-performance" }}
      onPointerMissed={() => select(null)}
      style={{ touchAction: "none" }}
      aria-label="Interactive 3D heat exchanger model"
    >
      <color attach="background" args={["#1B2733"]} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 5, 4]} intensity={1.7} />
      <directionalLight position={[-4, -2, -3]} intensity={0.6} />
      <ExchangerAssembly g={g} layout={layout} ev={ev}/>
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={0.3} maxDistance={40} />
      <CameraRig g={g} />
      <LabelProjector />
    </Canvas>
  );
}
