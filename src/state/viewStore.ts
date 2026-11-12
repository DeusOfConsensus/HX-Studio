import { create } from "zustand";
import type { ExchangerInput } from "../engineering/types";
import { sampleConfiguration, sampleDoublePipe } from "../engineering/sampleConfiguration";

export type ViewName = "iso" | "front" | "side" | "top" | "fit";

export interface ViewState {
  input: ExchangerInput;
  setInput: (fn: (draft: ExchangerInput) => ExchangerInput) => void;
  loadInput: (x: ExchangerInput) => void;
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
}

export const useView = create<ViewState>((set) => ({
  input: sampleConfiguration,
  setInput: (fn) => set((s) => ({ input: fn(s.input) })),
  loadInput: (x) => set({ input: x, selected: null, selectedTube: null, isolated: null }),
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
}));
