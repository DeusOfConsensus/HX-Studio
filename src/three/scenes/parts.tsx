/** Shared building blocks: selectable/hideable parts, materials with clipping, exploded-view groups. */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useView } from "../../state/viewStore";
import { SceneLabel } from "./labels";

export const COLORS = {
  steel: "#8C9AA6",
  shell: "#6F8396",
  head: "#7C8D9C",
  sheet: "#A3AFB9",
  baffle: "#5E6E7C",
  tube: "#B4BFC8",
  nozzle: "#7C8D9C",
  support: "#4A5967",
  partition: "#C9D2D9",
  select: "#00A6A6",
} as const;

/** One shared clipping plane; constant follows the slider. */
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

export function useClipPlanes(Rs: number) {
  const clipOn = useView((s) => s.clipOn);
  const clipPos = useView((s) => s.clipPos);
  clipPlane.constant = clipPos * Rs; // keeps z ≤ clipPos·Rs
  return useMemo(() => (clipOn ? [clipPlane] : []), [clipOn]);
}

/** Enable local clipping once on the renderer. */
export function useEnableClipping() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
}

export function usePartState(id: string) {
  const hidden = useView((s) => !!s.hidden[id]);
  const isolated = useView((s) => s.isolated);
  const selected = useView((s) => s.selected === id);
  const visible = !hidden && (isolated === null || isolated === id);
  return { visible, selected };
}

export function Mat({
  id,
  color,
  opacity = 1,
  clip,
  metalness = 0.2,
  roughness = 0.55,
}: {
  id: string;
  color: string;
  opacity?: number;
  clip: THREE.Plane[];
  metalness?: number;
  roughness?: number;
}) {
  const { selected } = usePartState(id);
  return (
    <meshStandardMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      emissive={selected ? COLORS.select : "#000000"}
      emissiveIntensity={selected ? 0.55 : 0}
      transparent={opacity < 1}
      opacity={opacity}
      depthWrite={opacity >= 1}
      side={THREE.DoubleSide}
      clippingPlanes={clip}
    />
  );
}

/** Group that handles visibility/isolation, click selection and an optional name label. */
export function Selectable({
  id,
  name,
  labelAt,
  children,
}: {
  id: string;
  name?: string;
  labelAt?: [number, number, number];
  children: ReactNode;
}) {
  const { visible, selected } = usePartState(id);
  const select = useView((s) => s.select);
  const showNames = useView((s) => s.showNames);
  if (!visible) return null;
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select(selected ? null : id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      {children}
      {showNames && name && labelAt ? <SceneLabel id={`name-${id}`} position={labelAt} kind="name" title={name} /> : null}
    </group>
  );
}

/** Exploded-view group: eases toward dir·distance·explode, reversible. */
export function Explode({ dir, children }: { dir: [number, number, number]; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const target = useView.getState().explode;
    const k = Math.min(1, dt * 6);
    const tx = dir[0] * target;
    const ty = dir[1] * target;
    const tz = dir[2] * target;
    const dx = tx - g.position.x;
    const dy = ty - g.position.y;
    const dz = tz - g.position.z;
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-4) {
      g.position.x += dx * k;
      g.position.y += dy * k;
      g.position.z += dz * k;
      invalidate();
    } else g.position.set(tx, ty, tz);
  });
  return <group ref={ref}>{children}</group>;
}

/** Dispose a geometry when the component unmounts or the geometry is replaced. */
export function useDisposable<T extends THREE.BufferGeometry>(factory: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geo = useMemo(factory, deps);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}
