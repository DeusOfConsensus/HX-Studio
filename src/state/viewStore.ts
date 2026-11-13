import { create } from "zustand";
import type { ExchangerInput } from "../engineering/types";
import { sampleConfiguration, sampleDoublePipe } from "../engineering/sampleConfiguration";

function zeroInputValues(input: ExchangerInput): ExchangerInput {
  const zeroStream = (stream: ExchangerInput["hot"]) => ({
    ...stream,
    Tin: 0,
    Tout: input.mode === "duty" ? 0 : undefined,
    mdot: 0,
    pressure: 0,
    manual: stream.manual ? { rho: 0, cp: 0, mu: 0, k: 0 } : undefined,
  });
  return {
    ...input,
    hot: zeroStream(input.hot),
    cold: zeroStream(input.cold),
    specifiedQ: 0,
    geometry: {
      ...input.geometry,
      di: 0, t: 0, L: 0, Nt: 0, pitch: 0, Ds: 0,
      tubePasses: 0, shellPasses: 0, baffleSpacing: 0, baffleCut: 0,
      kw: 0, roughness: 0,
    },
    operating: {
      ...input.operating,
      pumpEfficiency: 0, Rfi: 0, Rfo: 0,
      propertyEvalTemp: input.operating.propertyEvalTemp === undefined ? undefined : 0,
      velocityLimits: { liquidTube: [0, 0], liquidShell: [0, 0], gas: [0, 0] },
      energyBalanceTolerance: 0,
    },
  };
}

export type ViewName = "iso" | "front" | "side" | "top" | "fit";

export interface ViewState {
  input: ExchangerInput;
  setInput: (fn: (draft: ExchangerInput) => ExchangerInput) => void;
  loadInput: (x: ExchangerInput) => void;
  resetInputsToZero: () => void;
  /** Per-type configuration memory so switching exchanger type never discards the other type's edits. */
  stash: Partial<Record<ExchangerInput["geometry"]["type"], ExchangerInput>>;
  switchType: (t: ExchangerInput["geometry"]["type"]) => void;

  selected: string | null;
  selectedTube: number | null;
  select: (id: string | null, tube?: number | null) => void;
  hidden: Record<string, boolean>;
  toggleHidden: (id: string) => void;
  isolated: string | null;
  setIsolated: (id: string | null) => void;

  shellOpacity: number;
  explode: number;
  clipOn: boolean;
  clipPos: number; // -1..1 of shell radius
  setView: (p: Partial<ViewState>) => void;

  running: boolean;
  speed: number;
  density: number;
  showFlow: boolean;
  showThermal: boolean;
  showTempLabels: boolean;
  showNames: boolean;
  simNonce: number;
  quality: "high" | "low";

  viewCmd: { name: ViewName; n: number };
  goView: (name: ViewName) => void;
  zoomCmd: { factor: number; n: number };
  zoomBy: (factor: number) => void;
}

export const useView = create<ViewState>((set) => ({
  input: sampleConfiguration,
  setInput: (fn) => set((s) => ({ input: fn(s.input) })),
  loadInput: (x) => set({ input: x, selected: null, selectedTube: null, isolated: null }),
  resetInputsToZero: () => set((s) => {
    const shell = s.input.geometry.type === "shell-and-tube" ? s.input : s.stash["shell-and-tube"] ?? sampleConfiguration;
    const pipe = s.input.geometry.type === "double-pipe" ? s.input : s.stash["double-pipe"] ?? sampleDoublePipe;
    return {
      input: zeroInputValues(s.input),
      stash: { ...s.stash, "shell-and-tube": zeroInputValues(shell), "double-pipe": zeroInputValues(pipe) },
      selected: null, selectedTube: null, hidden: {}, isolated: null,
      shellOpacity: 0.25, explode: 0, clipOn: false, clipPos: 0,
      running: false, speed: 0.8, density: 0.55,
      showFlow: true, showThermal: true, showTempLabels: false, showNames: false,
      simNonce: s.simNonce + 1, quality: "low",
      viewCmd: { name: "iso", n: s.viewCmd.n + 1 },
    };
  }),
  stash: { "double-pipe": sampleDoublePipe },
  switchType: (t) =>
    set((s) => {
      if (s.input.geometry.type === t) return {};
      const next = s.stash[t] ?? (t === "double-pipe" ? sampleDoublePipe : sampleConfiguration);
      return {
        stash: { ...s.stash, [s.input.geometry.type]: s.input },
        input: next,
        selected: null,
        selectedTube: null,
        isolated: null,
        hidden: {},
      };
    }),

  selected: null,
  selectedTube: null,
  select: (id, tube = null) => set({ selected: id, selectedTube: tube }),
  hidden: {},
  toggleHidden: (id) => set((s) => ({ hidden: { ...s.hidden, [id]: !s.hidden[id] } })),
  isolated: null,
  setIsolated: (id) => set({ isolated: id }),

  shellOpacity: 0.28,
  explode: 0,
  clipOn: false,
  clipPos: 0,
  setView: (p) => set(p as Partial<ViewState>),

  running: true,
  speed: 1,
  density: 0.8,
  showFlow: true,
  showThermal: true,
  showTempLabels: true,
  showNames: false,
  simNonce: 0,
  quality: "high",

  viewCmd: { name: "iso", n: 0 },
  goView: (name) => set((s) => ({ viewCmd: { name, n: s.viewCmd.n + 1 } })),
  zoomCmd: { factor: 1, n: 0 },
  zoomBy: (factor) => set((s) => ({ zoomCmd: { factor, n: s.zoomCmd.n + 1 } })),
}));
