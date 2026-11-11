import { describe, expect, it } from "vitest";
import { evaluate } from "../../simulation/solvers/exchangerSolver";
import { sampleConfiguration } from "../../engineering/sampleConfiguration";
import type { ExchangerInput } from "../../engineering/types";

const clone = (x: ExchangerInput): ExchangerInput => JSON.parse(JSON.stringify(x));

describe("area adequacy status", () => {
  it("rating mode: required = available is NOT flagged as a shortfall (float noise tolerated)", () => {
    const a = evaluate(sampleConfiguration).parameters.find((p) => p.id === "A")!;
    expect(a.status).toBe("calculated");
  });
  it("duty mode with too-short tubes IS flagged", () => {
    const x = clone(sampleConfiguration);
    x.mode = "duty";
    x.hot.Tout = 55;
    x.cold.Tout = 25 + (2 * 4190 * 30) / (3 * 4180);
    x.geometry.L = 0.5;
    const e = evaluate(x);
    const a = e.parameters.find((p) => p.id === "A")!;
    expect(a.status).toBe("warning");
    expect(a.details.adequacyPct as number).toBeLessThan(100);
  });
});
