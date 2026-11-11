/**
 * Numerical bulk-temperature profiles along the exchanger (1-D, RK4). These are numerically
 * estimated BULK profiles from the ε–NTU/UA model — not CFD, no local/wall/turbulence fields.
 *
 * Coordinate ξ ∈ [0,1] runs along the HOT stream direction (hot inlet at ξ = 0).
 *   dTh/dξ = −(UA/Ch)(Th − Tc)
 *   parallel: cold enters at ξ = 0, dTc/dξ = +(UA/Cc)(Th − Tc)
 *   counter : cold enters at ξ = 1, dTc/dξ = −(UA/Cc)(Th − Tc)   (two-point BVP, solved by
 *             linear shooting, exact because the system is linear)
 */

export interface TemperatureProfile {
  xi: number[];
  Th: number[];
  Tc: number[];
  arrangement: "parallel" | "counter";
  /** True when the unit is multipass: profile is the equivalent counterflow representation. */
  equivalentRepresentation: boolean;
  note: string;
}

function rk4(
  a: number,
  b: number,
  Th0: number,
  Tc0: number,
  sign: 1 | -1,
  n: number,
): { Th: number[]; Tc: number[] } {
  const h = 1 / n;
  const Th = [Th0];
  const Tc = [Tc0];
  const f = (th: number, tc: number) => [-a * (th - tc), sign * b * (th - tc)];
  for (let i = 0; i < n; i++) {
    const [k1h, k1c] = f(Th[i], Tc[i]);
    const [k2h, k2c] = f(Th[i] + (h / 2) * k1h, Tc[i] + (h / 2) * k1c);
    const [k3h, k3c] = f(Th[i] + (h / 2) * k2h, Tc[i] + (h / 2) * k2c);
    const [k4h, k4c] = f(Th[i] + h * k3h, Tc[i] + h * k3c);
    Th.push(Th[i] + (h / 6) * (k1h + 2 * k2h + 2 * k3h + k4h));
    Tc.push(Tc[i] + (h / 6) * (k1c + 2 * k2c + 2 * k3c + k4c));
  }
  return { Th, Tc };
}

export function temperatureProfile(args: {
  arrangement: "parallel" | "counter";
  UA: number; // W/K (effective UA of the equivalent single-pass unit)
  Ch: number;
  Cc: number;
  ThIn: number;
  TcIn: number;
  n?: number;
  equivalentRepresentation?: boolean;
}): TemperatureProfile {
  const n = args.n ?? 100;
  const a = args.UA / args.Ch;
  const b = args.UA / args.Cc;
  const xi = Array.from({ length: n + 1 }, (_, i) => i / n);
  let Th: number[];
  let Tc: number[];
  if (args.arrangement === "parallel") {
    ({ Th, Tc } = rk4(a, b, args.ThIn, args.TcIn, 1, n));
  } else {
    // Shoot on the unknown cold outlet Tc(ξ=0) = s; the residual Tc(1; s) − TcIn is affine in s,
    // so two trial integrations determine s exactly.
    const resid = (s: number) => rk4(a, b, args.ThIn, s, -1, n).Tc[n] - args.TcIn;
    const r0 = resid(0);
    const r1 = resid(1);
    const slope = r1 - r0;
    const s = -r0 / slope;
    ({ Th, Tc } = rk4(a, b, args.ThIn, s, -1, n));
  }
  return {
    xi,
    Th,
    Tc,
    arrangement: args.arrangement,
    equivalentRepresentation: args.equivalentRepresentation ?? false,
    note: args.equivalentRepresentation
      ? "Multipass unit: profile shown is the equivalent counterflow unit that reproduces the same terminal temperatures. Internal pass-by-pass profiles are not resolved."
      : "Bulk-fluid profile from a 1-D energy balance with constant UA; no local, wall or turbulence effects.",
  };
}
