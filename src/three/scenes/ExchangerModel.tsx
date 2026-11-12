/** Procedural shell-and-tube and double-pipe geometry. Everything is derived from `GeometryInput` via layout.ts. */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Evaluation } from "../../simulation/solvers/exchangerSolver";
import type { GeometryInput } from "../../engineering/types";
import { useView } from "../../state/viewStore";
import {
  baffleStations,
  dimsOf,
  nozzlePlacements,
  type NozzlePlacement,
  type TubeLayout,
} from "../geometries/layout";
import { COLORS, Explode, Mat, Selectable, useClipPlanes, useDisposable, useEnableClipping, usePartState } from "./parts";
import { NozzleMarkers } from "./NozzleMarkers";

interface Props {
  g: GeometryInput;
  layout: TubeLayout;
  ev: Evaluation;
}

const NOZ_ID: Record<NozzlePlacement["id"], string> = {
  shellIn: "nozzleShellIn",
  shellOut: "nozzleShellOut",
  tubeIn: "nozzleTubeIn",
  tubeOut: "nozzleTubeOut",
};
const NOZ_NAME: Record<NozzlePlacement["id"], string> = {
  shellIn: "Shell-side inlet",
  shellOut: "Shell-side outlet",
  tubeIn: "Tube-side inlet",
  tubeOut: "Tube-side outlet",
};

/** Cylinder whose axis is x, spanning x0..x1. */
function AxialCylinder({ x0, x1, r, open = false, seg = 48, children }: { x0: number; x1: number; r: number; open?: boolean; seg?: number; children: React.ReactNode }) {
  const geo = useDisposable(() => new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), seg, 1, open), [r, x0, x1, open, seg]);
  return (
    <mesh geometry={geo} position={[(x0 + x1) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      {children}
    </mesh>
  );
}

function Nozzle({ n, g, clip, ev }: { n: NozzlePlacement; g: GeometryInput; clip: THREE.Plane[]; ev: Evaluation }) {
  const id = NOZ_ID[n.id];
  const dm = dimsOf(g);
  const axial = Math.abs(n.outward[0]) === 1;
  // cylinder centred half a nozzle-length outward of the base
  const c: [number, number, number] = [
    n.base[0] + n.outward[0] * dm.nozzleLen * 0.5,
    n.base[1] + n.outward[1] * dm.nozzleLen * 0.5,
    n.base[2] + n.outward[2] * dm.nozzleLen * 0.5,
  ];
  return (
    <Selectable id={id} name={NOZ_NAME[n.id]} labelAt={[c[0], c[1] + (axial ? 0.06 : 0.04 * Math.sign(n.outward[1] || 1)), c[2]]}>
      {n.drawn ? (
        <>
          <mesh position={c} rotation={axial ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
            <cylinderGeometry args={[dm.nozzleR, dm.nozzleR, dm.nozzleLen, 24]} />
            <Mat id={id} color={COLORS.nozzle} clip={clip} />
          </mesh>
          <mesh
            position={[n.base[0] + n.outward[0] * dm.nozzleLen, n.base[1] + n.outward[1] * dm.nozzleLen, n.base[2] + n.outward[2] * dm.nozzleLen]}
            rotation={axial ? [0, 0, Math.PI / 2] : [0, 0, 0]}
          >
            <cylinderGeometry args={[dm.nozzleR * 1.45, dm.nozzleR * 1.45, 0.014, 24]} />
            <Mat id={id} color={COLORS.sheet} clip={clip} />
          </mesh>
        </>
      ) : null}
      <NozzleMarkers n={n} g={g} ev={ev} />
    </Selectable>
  );
}

function Baffles({ g, clip }: { g: GeometryInput; clip: THREE.Plane[] }) {
  const { visible } = usePartState("baffles");
  const select = useView((s) => s.select);
  const stations = useMemo(() => baffleStations(g), [g]);
  const Rs = g.Ds / 2;
  const geo = useDisposable(() => {
    const R = Rs - 0.002;
    const y0 = R - g.baffleCut * g.Ds; // chord height; material removed above y0 (cut at top)
    const a = Math.asin(Math.max(-1, Math.min(1, y0 / R)));
    const shape = new THREE.Shape();
    shape.moveTo(R * Math.cos(Math.PI - a), y0);
    shape.absarc(0, 0, R, Math.PI - a, 2 * Math.PI + a, false);
    shape.closePath();
    const e = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false, curveSegments: 40 });
    e.rotateY(Math.PI / 2);
    e.translate(-0.003, 0, 0);
    return e;
  }, [Rs, g.baffleCut, g.Ds]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const mat = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    stations.forEach((x, i) => {
      rot.makeRotationX(i % 2 === 0 ? 0 : Math.PI);
      mat.makeTranslation(x, 0, 0).multiply(rot);
      m.setMatrixAt(i, mat);
    });
    m.count = stations.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [stations, geo]);
  if (!visible || stations.length === 0) return null;
  return (
    <instancedMesh
      key={stations.length}
      ref={ref}
      args={[geo, undefined, stations.length]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select("baffles");
      }}
    >
      <Mat id="baffles" color={COLORS.baffle} clip={clip} />
    </instancedMesh>
  );
}

function Tubes({ g, layout, clip }: { g: GeometryInput; layout: TubeLayout; clip: THREE.Plane[] }) {
  const { visible } = usePartState("tubes");
  const selectedTube = useView((s) => s.selectedTube);
  const select = useView((s) => s.select);
  const d0 = g.di + 2 * g.t;
  const geo = useDisposable(() => {
    const c = new THREE.CylinderGeometry(d0 / 2, d0 / 2, g.L, 14, 1, false);
    c.rotateZ(Math.PI / 2);
    return c;
  }, [d0, g.L]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const mat = new THREE.Matrix4();
    layout.tubes.forEach((t, i) => {
      mat.makeTranslation(g.L / 2, t.y, t.z);
      m.setMatrixAt(i, mat);
    });
    m.count = layout.tubes.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [layout, g.L, geo]);
  if (!visible) return null;
  const sel = selectedTube !== null ? layout.tubes[selectedTube] : undefined;
  return (
    <group>
      <instancedMesh
        key={`${layout.tubes.length}-${d0}-${g.L}`}
        ref={ref}
        args={[geo, undefined, layout.tubes.length]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          select("tubes", e.instanceId ?? null);
        }}
      >
        <Mat id="tubes" color={COLORS.tube} clip={clip} metalness={0.3} roughness={0.45} />
      </instancedMesh>
      {sel ? (
        <mesh geometry={geo} position={[g.L / 2, sel.y, sel.z]} scale={[1.001, 1.35, 1.35]}>
          <meshStandardMaterial color={COLORS.select} emissive={COLORS.select} emissiveIntensity={0.9} clippingPlanes={clip} />
        </mesh>
      ) : null}
    </group>
  );
}

function ShellAndTube({ g, layout, ev }: Props) {
  const clip = useClipPlanes(g.Ds / 2);
  const shellOpacity = useView((s) => s.shellOpacity);
  const d = dimsOf(g);
  const noz = useMemo(() => nozzlePlacements(g), [g]);
  const u = Math.max(0.4, 0.3 * g.L);
  const sheetR = d.Rs + 0.025;
  const nozzlesOf = (parent: NozzlePlacement["parent"]) =>
    noz.filter((n) => n.parent === parent).map((n) => <Nozzle key={n.id} n={n} g={g} clip={clip} ev={ev} />);

  const partition = (y: number, x0: number, key: string) => {
    const half = Math.sqrt(Math.max(0, d.Rs * d.Rs - y * y));
    return (
      <mesh key={key} position={[x0, y, 0]}>
        <boxGeometry args={[d.headLen * 0.98, 0.005, half * 2 * 0.99]} />
        <Mat id="frontHead" color={COLORS.partition} clip={clip} />
      </mesh>
    );
  };
  // partitions: front head at even boundaries, rear head at odd ones
  const frontPlates = layout.passBoundaries.map((y, k) => (k % 2 === 0 ? partition(y, -d.headLen / 2, `f${k}`) : null));
  const rearPlates = layout.passBoundaries.map((y, k) => (k % 2 === 1 ? partition(y, g.L + d.headLen / 2, `r${k}`) : null));

  return (
    <group>
      {/* shell + shell nozzles lift together */}
      <Explode dir={[0, d.Rs * 2.6, 0]}>
        <Selectable id="shell" name="Shell" labelAt={[g.L * 0.5, d.Rs + 0.05, 0]}>
          <AxialCylinder x0={0} x1={g.L} r={d.Rs} open>
            <Mat id="shell" color={COLORS.shell} opacity={shellOpacity} clip={clip} />
          </AxialCylinder>
        </Selectable>
        {nozzlesOf("shell")}
      </Explode>

      {/* tube bundle stays put */}
      <Selectable id="tubes" name="Tube bundle" labelAt={[g.L * 0.5, 0, 0]}>
        <Tubes g={g} layout={layout} clip={clip} />
      </Selectable>
      <Selectable id="baffles" name="Baffles" labelAt={[g.baffleSpacing, d.Rs * 0.8, 0]}>
        <Baffles g={g} clip={clip} />
      </Selectable>

      {/* tubesheets */}
      <Explode dir={[-u * 0.65, 0, 0]}>
        <Selectable id="tubesheetFront" name="Front tubesheet" labelAt={[0, -sheetR - 0.04, 0]}>
          <AxialCylinder x0={-d.sheetT / 2} x1={d.sheetT / 2} r={sheetR}>
            <Mat id="tubesheetFront" color={COLORS.sheet} clip={clip} />
          </AxialCylinder>
        </Selectable>
      </Explode>
      <Explode dir={[u * 0.65, 0, 0]}>
        <Selectable id="tubesheetRear" name="Rear tubesheet" labelAt={[g.L, -sheetR - 0.04, 0]}>
          <AxialCylinder x0={g.L - d.sheetT / 2} x1={g.L + d.sheetT / 2} r={sheetR}>
            <Mat id="tubesheetRear" color={COLORS.sheet} clip={clip} />
          </AxialCylinder>
        </Selectable>
      </Explode>

      {/* channel heads (+ their nozzles and partitions) */}
      <Explode dir={[-u * 1.25, 0, 0]}>
        <Selectable id="frontHead" name="Front channel head" labelAt={[-d.headLen / 2, d.Rs + 0.05, 0]}>
          <AxialCylinder x0={-d.headLen} x1={-d.sheetT / 2} r={d.Rs + 0.012}>
            <Mat id="frontHead" color={COLORS.head} opacity={0.55} clip={clip} />
          </AxialCylinder>
          {frontPlates}
        </Selectable>
        {nozzlesOf("frontHead")}
      </Explode>
      <Explode dir={[u * 1.25, 0, 0]}>
        <Selectable id="rearHead" name="Rear channel head" labelAt={[g.L + d.headLen / 2, d.Rs + 0.05, 0]}>
          <AxialCylinder x0={g.L + d.sheetT / 2} x1={g.L + d.headLen} r={d.Rs + 0.012}>
            <Mat id="rearHead" color={COLORS.head} opacity={0.55} clip={clip} />
          </AxialCylinder>
          {rearPlates}
        </Selectable>
        {nozzlesOf("rearHead")}
      </Explode>

      {/* saddle supports (visual) */}
      <Explode dir={[0, -d.Rs * 1.2, 0]}>
        <Selectable id="supports" name="Saddle supports" labelAt={[g.L * 0.2, -d.Rs - 0.12, 0]}>
          {[0.2, 0.8].map((f) => (
            <mesh key={f} position={[g.L * f, -d.Rs - 0.05, 0]}>
              <boxGeometry args={[0.05, 0.1, d.Rs * 1.5]} />
              <Mat id="supports" color={COLORS.support} clip={clip} />
            </mesh>
          ))}
        </Selectable>
      </Explode>
    </group>
  );
}

function DoublePipe({ g, ev }: Props) {
  const clip = useClipPlanes(g.Ds / 2);
  const shellOpacity = useView((s) => s.shellOpacity);
  const d = dimsOf(g);
  const d0 = g.di + 2 * g.t;
  const noz = useMemo(() => nozzlePlacements(g), [g]);
  const ringGeo = useDisposable(() => {
    const r = new THREE.RingGeometry(d0 / 2, d.Rs + 0.012, 48);
    r.rotateY(Math.PI / 2);
    return r;
  }, [d0, d.Rs]);
  const nozzlesOf = (parent: NozzlePlacement["parent"]) =>
    noz.filter((n) => n.parent === parent).map((n) => <Nozzle key={n.id} n={n} g={g} clip={clip} ev={ev} />);
  return (
    <group>
      <Explode dir={[0, d.Rs * 3, 0]}>
        <Selectable id="outerPipe" name="Outer pipe" labelAt={[g.L / 2, d.Rs + 0.05, 0]}>
          <AxialCylinder x0={0} x1={g.L} r={d.Rs} open>
            <Mat id="outerPipe" color={COLORS.shell} opacity={shellOpacity} clip={clip} />
          </AxialCylinder>
          <mesh geometry={ringGeo} position={[0, 0, 0]}>
            <Mat id="outerPipe" color={COLORS.sheet} clip={clip} />
          </mesh>
          <mesh geometry={ringGeo} position={[g.L, 0, 0]}>
            <Mat id="outerPipe" color={COLORS.sheet} clip={clip} />
          </mesh>
        </Selectable>
        {nozzlesOf("outerPipe")}
      </Explode>
      <Selectable id="innerTube" name="Inner tube" labelAt={[g.L * 0.5, 0, 0]}>
        <AxialCylinder x0={-d.tubeExt} x1={g.L + d.tubeExt} r={d0 / 2} seg={32}>
          <Mat id="innerTube" color={COLORS.tube} clip={clip} metalness={0.3} roughness={0.45} />
        </AxialCylinder>
      </Selectable>
      {nozzlesOf("innerTube")}
    </group>
  );
}

export function ExchangerModel(props: Props) {
  useEnableClipping();
  return props.g.type === "double-pipe" ? <DoublePipe {...props} /> : <ShellAndTube {...props} />;
}
