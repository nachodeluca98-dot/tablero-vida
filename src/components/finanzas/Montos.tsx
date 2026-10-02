import { fmtArs, fmtUsd } from "@/lib/finanzas/dinero";

// Todo monto se muestra ARS | USD, sin toggle (spec §3.5). La moneda original va resaltada.
export default function Montos({
  ars, usd, original = "ARS", tamano,
}: { ars: number | null | undefined; usd: number | null | undefined; original?: "ARS" | "USD"; tamano?: number }) {
  const a = <span key="a" className={original === "ARS" ? "principal" : "secundario"}>{fmtArs(ars)}</span>;
  const u = <span key="u" className={original === "USD" ? "principal" : "secundario"}>{fmtUsd(usd)}</span>;
  return (
    <span className="fin-montos" style={tamano ? { fontSize: tamano } : undefined}>
      {a}
      {u}
    </span>
  );
}
