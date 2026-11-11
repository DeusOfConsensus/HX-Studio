/** Tabulated-property interpolation helpers. */

export interface TableRow {
  T: number; // °C
  rho?: number;
  cp: number;
  mu: number;
  k: number;
}

/**
 * Linear interpolation of cp, k, rho; log-linear interpolation of mu (viscosity varies
 * roughly exponentially with T, so this is markedly more accurate than linear for glycols).
 * Returns inRange=false (and clamps to the end values) outside the tabulated range.
 */
export function interpolateTable(rows: TableRow[], T: number) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (T <= first.T || T >= last.T) {
    const r = T <= first.T ? first : last;
    return { rho: r.rho, cp: r.cp, mu: r.mu, k: r.k, inRange: T >= first.T && T <= last.T };
  }
  let i = 0;
  while (rows[i + 1].T < T) i++;
  const a = rows[i];
  const b = rows[i + 1];
  const f = (T - a.T) / (b.T - a.T);
  const lin = (x: number, y: number) => x + f * (y - x);
  return {
    rho: a.rho !== undefined && b.rho !== undefined ? lin(a.rho, b.rho) : undefined,
    cp: lin(a.cp, b.cp),
    mu: Math.exp(lin(Math.log(a.mu), Math.log(b.mu))),
    k: lin(a.k, b.k),
    inRange: true,
  };
}
