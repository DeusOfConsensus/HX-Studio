/**
 * Label system: scene anchors (object3D) + ONE plain-DOM overlay positioned each frame.
 * Replaces drei <Html>, which created a separate React root per label (one never rendered and
 * unmounting another threw removeChild errors).
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface Entry {
  id: string;
  obj: THREE.Object3D;
  kind: "temp" | "name";
  title: string;
  value?: string;
  color?: string;
  el?: HTMLDivElement | null;
}

const entries = new Map<string, Entry>();
let snapshot: Entry[] = [];
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = [...entries.values()];
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => snapshot;

export function SceneLabel({
  id,
  position,
  kind,
  title,
  value,
  color,
}: {
  id: string;
  position: [number, number, number];
  kind: "temp" | "name";
  title: string;
  value?: string;
  color?: string;
}) {
  const ref = useRef<THREE.Object3D>(null);
  useEffect(() => {
    const obj = ref.current;
    if (!obj) return;
    entries.set(id, { id, obj, kind, title, value, color });
    emit();
    return () => {
      entries.delete(id);
      emit();
    };
  }, [id, kind, title, value, color]);
  return <object3D ref={ref} position={position} />;
}

/** Inside <Canvas>: projects every anchor to screen space each rendered frame. */
export function LabelProjector() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const e of entries.values()) {
      if (!e.el) continue;
      e.obj.getWorldPosition(v);
      v.project(camera);
      if (v.z > 1 || v.z < -1) {
        e.el.style.display = "none";
        continue;
      }
      e.el.style.display = "flex";
      e.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

/** Outside <Canvas>, inside the (relative) viewport wrapper. */
export function LabelOverlay() {
  const list = useSyncExternalStore(subscribe, getSnapshot);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {list.map((e) => (
        <div
          key={e.id}
          ref={(el) => {
            e.el = el;
          }}
          className={e.kind === "temp" ? "hx-temp-label" : "hx-name-label"}
          style={{ position: "absolute", left: 0, top: 0, display: "none", borderColor: e.color }}
        >
          {e.kind === "temp" ? (
            <>
              <span style={{ color: e.color }}>{e.title}</span>
              <b>{e.value}</b>
            </>
          ) : (
            e.title
          )}
        </div>
      ))}
    </div>
  );
}
