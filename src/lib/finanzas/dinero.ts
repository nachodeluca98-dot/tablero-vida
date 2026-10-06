// Doble moneda (spec §3.5). Se usa en servidor y en cliente: no importar Prisma acá.

export type Moneda = "ARS" | "USD";
export type Montos = { ars: number | null; usd: number | null };

const redondear = (n: number) => Math.round(n * 100) / 100;

// Equivalentes en ARS y USD. La moneda original siempre queda cargada; la otra es null si no hay tipo de cambio.
export function equivalentes(monto: number, moneda: Moneda, tc: number | null | undefined): Montos {
  if (moneda === "ARS") return { ars: redondear(monto), usd: tc ? redondear(monto / tc) : null };
  return { ars: tc ? redondear(monto * tc) : null, usd: redondear(monto) };
}

// "$ 180.000" / "US$ 120" (spec §13)
export function fmtArs(n: number | null | undefined): string {
  if (n == null) return "—";
  const s = Math.round(Math.abs(n)).toLocaleString("es-AR");
  return `${n < 0 ? "−" : ""}$ ${s}`;
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const s = abs.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: abs >= 100 ? 0 : 2 });
  return `${n < 0 ? "−" : ""}US$ ${s}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export function sumarMontos(lista: Montos[]): Montos & { incompleto: boolean } {
  let ars = 0, usd = 0, incompleto = false;
  for (const m of lista) {
    if (m.ars == null || m.usd == null) incompleto = true;
    ars += m.ars ?? 0;
    usd += m.usd ?? 0;
  }
  return { ars: redondear(ars), usd: redondear(usd), incompleto };
}
