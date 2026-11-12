import { Component, type ReactNode } from "react";

/** Keeps a 3D/WebGL failure from taking down the engineering UI. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-col items-start justify-center gap-2 p-4 text-[13px]">
        <div style={{ color: "var(--err)" }}>✕ The 3D view failed: {this.state.error.message}</div>
        <div className="hx-label">Calculations and results are unaffected. Non-3D results are available in the panels.</div>
        <button type="button" className="hx-btn" onClick={() => this.setState({ error: null })}>
          Retry 3D view
        </button>
      </div>
    );
  }
}
