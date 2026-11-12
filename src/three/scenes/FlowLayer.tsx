/**
 * Flow + thermal visualisation.
 *  - particle speed = calculated stream velocity (state.tube.velocity / state.shell.velocity) × user speed
 *  - particle colour = discrete bin of the solver's bulk temperature at that particle's flow progress
 *  - banding along the shell stream = same profile sampled at segment centres
 * This is a depiction of a 1-D bulk model — NOT a CFD field: no turbulence, no local velocity
 * distribution, no wall temperatures.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Evaluation } from "../../simulation/solvers/exchangerSolver";
import type { GeometryInput } from "../../engineering/types";
import { useView } from "../../state/viewStore";
import { dimsOf, flowPlan, mulberry32, shellFreePositions, shellProgress, tubeProgress, type TubeLayout } from "../geometries/layout";
import { STREAM_COLORS, THERMAL_PALETTE, streamTemperature, thermalBin } from "../visualizations/thermalField";
import { useClipPlanes, useDisposable } from "./parts";

interface Props {
  g: GeometryInput;
  layout: TubeLayout;
  ev: Evaluation;
}

const PALETTE = THERMAL_PALETTE.map((c) => new THREE.Color(c));
const MAX_TUBES_SAMPLED = 14;

interface TubeParticle {
  y: number;
  z: number;
  pass: number;
  u0: number;
}
interface ShellParticle {
  y: number;
  z: number;
  u0: number;
}

function FlowInner({ g, layout, ev }: Props) {
  const clip = useClipPlanes(g.Ds / 2);
  const invalidate = useThree((s) => s.invalidate);
  const state = ev.state!;
  const profile = ev.profile!;
  const plan = useMemo(() => flowPlan(g), [g]);
  const d = dimsOf(g);

  const { tubeP, shellP } = useMemo(() => {
    const rnd = mulberry32(11);
    const tp: TubeParticle[] = [];
    if (g.type === "double-pipe") {
      for (let i = 0; i < 48; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * g.di * 0.4;
        tp.push({ y: r * Math.sin(a), z: r * Math.cos(a), pass: 0, u0: rnd() });
      }
    } else {
      const n = layout.tubes.length;
      const picks = Math.min(MAX_TUBES_SAMPLED, n);
      for (let k = 0; k < picks; k++) {
        const t = layout.tubes[Math.floor(((k + 0.5) * n) / picks)];
        for (let m = 0; m < 6; m++) {
          tp.push({ y: t.y + (rnd() - 0.5) * g.di * 0.4, z: t.z + (rnd() - 0.5) * g.di * 0.4, pass: t.pass, u0: rnd() });
        }
      }
    }
    const free = shellFreePositions(g, layout, g.type === "double-pipe" ? 140 : 220, 5);
    const sp: ShellParticle[] = free.map(([y, z]) => ({ y, z, u0: rnd() }));
    return { tubeP: tp, shellP: sp };
  }, [g, layout]);

  const tubeMesh = useRef<THREE.InstancedMesh>(null);
  const shellMesh = useRef<THREE.InstancedMesh>(null);
  const tubeU = useRef<number[]>([]);
  const shellU = useRef<number[]>([]);
  const tubeBin = useRef<number[]>([]);
  const shellBin = useRef<number[]>([]);
  const arrowGroup = useRef<THREE.Group>(null);
  const bandGroup = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  const sphereT = useDisposable(() => new THREE.SphereGeometry(Math.max(0.0025, g.di * 0.13), 8, 6), [g.di]);
  const sphereS = useDisposable(() => new THREE.SphereGeometry(0.0055, 8, 6), []);

  // reset phases (new geometry, or the Reset button)
  const simNonce = useView((s) => s.simNonce);
  useEffect(() => {
    tubeU.current = tubeP.map((p) => p.u0);
    shellU.current = shellP.map((p) => p.u0);
    tubeBin.current = tubeP.map(() => -1);
    shellBin.current = shellP.map(() => -1);
    invalidate();
  }, [tubeP, shellP, simNonce, invalidate]);

  const showThermal = useView((s) => s.showThermal);
  useEffect(() => {
    tubeBin.current = tubeP.map(() => -1);
    shellBin.current = shellP.map(() => -1);
    invalidate();
  }, [showThermal, tubeP, shellP, invalidate]);

  const Tmin = Math.min(state.TcIn, state.ThOut);
  const Tmax = state.ThIn;
  const vTube = state.tube.velocity;
  const vShell = state.shell.velocity;

  useFrame((_, dt) => {
    const st = useView.getState();
    const t = tubeMesh.current;
    const s = shellMesh.current;
    const advance = st.running ? Math.min(dt, 0.05) * st.speed : 0;
    const visibleAll = st.isolated === null;
    const exploded = st.explode > 0.02;
    const nT = Math.floor(tubeP.length * st.density);
    const nS = Math.floor(shellP.length * st.density);
    if (arrowGroup.current) arrowGroup.current.visible = visibleAll && !exploded && st.showFlow;
    if (bandGroup.current) bandGroup.current.visible = visibleAll && !exploded && st.showThermal && st.showFlow;

    if (t) {
      t.visible = visibleAll && st.showFlow;
      t.count = nT;
      for (let i = 0; i < nT; i++) {
        const p = tubeP[i];
        let u = tubeU.current[i] + (advance * vTube) / g.L;
        u -= Math.floor(u);
        tubeU.current[i] = u;
        const dir = plan.tubePassDir(p.pass);
        const x = dir > 0 ? u * g.L : (1 - u) * g.L;
        dummy.position.set(x, p.y, p.z);
        dummy.updateMatrix();
        t.setMatrixAt(i, dummy.matrix);
        const bin = st.showThermal ? thermalBin(streamTemperature(profile, plan.tubeStream, tubeProgress(plan, p.pass, u)), Tmin, Tmax) : -2;
        if (bin !== tubeBin.current[i]) {
          tubeBin.current[i] = bin;
          t.setColorAt(i, bin >= 0 ? PALETTE[bin] : col.set(STREAM_COLORS[plan.tubeStream]));
          if (t.instanceColor) t.instanceColor.needsUpdate = true;
        }
      }
      t.instanceMatrix.needsUpdate = true;
    }
    if (s) {
      s.visible = visibleAll && st.showFlow && !exploded;
      s.count = nS;
      for (let i = 0; i < nS; i++) {
        const p = shellP[i];
        let u = shellU.current[i] + (advance * vShell) / g.L;
        u -= Math.floor(u);
        shellU.current[i] = u;
        const x = plan.shellDir > 0 ? u * g.L : (1 - u) * g.L;
        dummy.position.set(x, p.y, p.z);
        dummy.updateMatrix();
        s.setMatrixAt(i, dummy.matrix);
        const bin = st.showThermal ? thermalBin(streamTemperature(profile, plan.shellStream, u), Tmin, Tmax) : -2;
        if (bin !== shellBin.current[i]) {
          shellBin.current[i] = bin;
          s.setColorAt(i, bin >= 0 ? PALETTE[bin] : col.set(STREAM_COLORS[plan.shellStream]));
          if (s.instanceColor) s.instanceColor.needsUpdate = true;
        }
      }
      s.instanceMatrix.needsUpdate = true;
    }
    if (st.running) invalidate();
  });

  // thermal bands along the shell stream (sampled from the same profile)
  const bands = useMemo(() => {
    const n = 16;
    return Array.from({ length: n }, (_, i) => {
      const xc = ((i + 0.5) / n) * g.L;
      const s = shellProgress(plan, g.L, xc);
      const T = streamTemperature(profile, plan.shellStream, s);
      return { x: xc, w: g.L / n, bin: thermalBin(T, Tmin, Tmax) };
    });
  }, [g.L, plan, profile, Tmin, Tmax]);

  const arrowXs = [0.12, 0.3, 0.5, 0.7, 0.88];
  const rot = (dir: number): [number, number, number] => [0, 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2];

  return (
    <group>
      <instancedMesh key={`t${tubeP.length}`} ref={tubeMesh} args={[sphereT, undefined, tubeP.length]} frustumCulled={false}>
        <meshBasicMaterial clippingPlanes={clip} />
      </instancedMesh>
      <instancedMesh key={`s${shellP.length}`} ref={shellMesh} args={[sphereS, undefined, shellP.length]} frustumCulled={false}>
        <meshBasicMaterial clippingPlanes={clip} />
      </instancedMesh>

      <group ref={bandGroup}>
        {bands.map((b, i) => (
          <mesh key={i} position={[b.x, 0, 0]} rotation={[0, 0, Math.PI / 2]} renderOrder={-1}>
            <cylinderGeometry args={[d.Rs * 0.985, d.Rs * 0.985, b.w * 0.999, 40, 1, true]} />
            <meshBasicMaterial color={THERMAL_PALETTE[b.bin]} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} clippingPlanes={clip} />
          </mesh>
        ))}
      </group>

      <group ref={arrowGroup}>
        {arrowXs.map((f) => (
          <mesh key={`s${f}`} position={[g.L * f, d.Rs + 0.17, 0]} rotation={rot(plan.shellDir)}>
            <coneGeometry args={[0.03, 0.09, 14]} />
            <meshBasicMaterial color={STREAM_COLORS[plan.shellStream]} />
          </mesh>
        ))}
        {!plan.multipass
          ? arrowXs.map((f) => (
              <mesh key={`t${f}`} position={[g.L * f, -(d.Rs + 0.17), 0]} rotation={rot(1)}>
                <coneGeometry args={[0.03, 0.09, 14]} />
                <meshBasicMaterial color={STREAM_COLORS[plan.tubeStream]} />
              </mesh>
            ))
          : null}
      </group>
    </group>
  );
}

export function FlowLayer(props: Props) {
  if (!props.ev.state || !props.ev.profile) return null;
  return <FlowInner {...props} />;
}
