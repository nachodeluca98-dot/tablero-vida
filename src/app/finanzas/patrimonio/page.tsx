"use client";
// Patrimonio (spec §6.9): total en ARS | USD y su evolución mensual; cuentas con el saldo del último cierre,
// editable en el lugar. Se alimenta principalmente desde el cierre de mes.
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { compacto, ConTabla, Linea, mesCorto, TablaDatos } from "@/components/finanzas/Graficos";
import Montos from "@/components/finanzas/Montos";
import MarcaPrimeraVez from "@/components/finanzas/MarcaPrimeraVez";
import { formatearTexto, montoDeTexto, textoDeMonto } from "@/components/finanzas/Teclado";
import { fmtArs, fmtUsd, type Moneda } from "@/lib/finanzas/dinero";
import { nombreMes } from "@/lib/finanzas/fechas";
import type { DatosPatrimonio } from "@/lib/finanzas/patrimonio";

const ICONO: Record<string, string> = { banco: "🏦", billetera: "📱", efectivo: "💵", broker: "📈", cripto: "🪙", otro: "📦" };

async function accion(body: object): Promise<DatosPatrimonio> {
  const r = await fetch("/api/finanzas/patrimonio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "No se pudo guardar");
  return j;
}

function SaldoEditable({ saldo, moneda, etiqueta, onGuardar }: { saldo: number | null; moneda: Moneda; etiqueta: string; onGuardar: (n: number) => void }) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <input
        className="inline"
        autoFocus
        inputMode="decimal"
        defaultValue={saldo != null ? textoDeMonto(saldo) : ""}
        aria-label={etiqueta}
        style={{ width: 130, textAlign: "right", fontWeight: 600, background: "transparent", border: "none", borderBottom: "1px dashed var(--acc)", borderRadius: 0, padding: "6px 0" }}
        onBlur={(e) => {
          setEditando(false);
          const t = e.target.value.replace(/\./g, "").trim();
          const n = t === "0" ? 0 : montoDeTexto(t);
          if (n != null && n !== saldo) onGuardar(n);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditando(true)} aria-label={`Editar ${etiqueta}`} style={{ background: "transparent", border: "none", padding: "6px 0", minHeight: 44, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: saldo == null ? "var(--tx3)" : "var(--tx)" }}>
      {saldo == null ? "Cargar saldo" : `${moneda === "USD" ? "US$" : "$"} ${formatearTexto(textoDeMonto(saldo))}`}
    </button>
  );
}

function Patrimonio() {
  const sp = useSearchParams();
  const [d, setD] = useState<DatosPatrimonio | null>(null);
  const [nueva, setNueva] = useState({ nombre: "", tipo: "banco", moneda: "ARS" as Moneda });
  const [agregando, setAgregando] = useState(!!sp.get("nueva"));
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/finanzas/patrimonio", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r) setD(r);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  async function hacer(b: object, ok: string) {
    try { setD(await accion(b)); setAviso(ok); } catch (e) { setAviso(e instanceof Error ? e.message : "No se pudo"); }
  }

  if (!d) return <div style={{ color: "var(--tx3)" }}>Cargando…</div>;
  const meses = d.evolucion.meses;
  const ultimo = meses[meses.length - 1];
  const anterior = meses.length > 1 ? meses[meses.length - 2] : null;
  const dif = ultimo && anterior ? (ultimo.total.usd ?? 0) - (anterior.total.usd ?? 0) : null;

  return (
    <>
      <h1>Patrimonio</h1>

      {ultimo ? (
        <div className="fin-kpi">
          <div className="fin-kpi-label">Total</div>
          <Montos ars={ultimo.total.ars} usd={ultimo.total.usd} original="USD" tamano={22} />
          {dif != null && (
            <div style={{ fontSize: 12, color: dif >= 0 ? "var(--sal-t)" : "var(--amb-t)", marginTop: 2 }}>
              {dif >= 0 ? "▲" : "▼"} {fmtUsd(Math.abs(dif))} vs. {nombreMes(anterior!.anioMes)}
            </div>
          )}
          {meses.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <ConTabla tabla={<TablaDatos columnas={["Mes", "USD", "ARS"]} filas={meses.map((m) => [mesCorto(m.anioMes), fmtUsd(m.total.usd), fmtArs(m.total.ars)])} />}>
                <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 4 }}>Evolución en dólares</div>
                <Linea etiquetas={meses.map((m) => mesCorto(m.anioMes))} valores={meses.map((m) => m.total.usd ?? 0)} formato={(n) => compacto(n, "US$ ")} formatoDetalle={fmtUsd} detalle={(i) => [`En pesos: ${fmtArs(meses[i].total.ars)}`]} />
              </ConTabla>
            </div>
          )}
        </div>
      ) : (
        <div className="fin-vacio">
          <strong>Seguí tu patrimonio</strong>
          Cargá tus cuentas una vez (banco, billetera, efectivo, dólares, inversiones) y en cada cierre de mes solo confirmás los saldos. Así ves cómo crece mes a mes.
        </div>
      )}

      <section className="fin-seccion">
        <div className="fin-seccion-head">
          <h2>Cuentas</h2>
          {!agregando && <button type="button" className="fin-link" onClick={() => setAgregando(true)}>+ Agregar</button>}
        </div>
        {d.cuentas.some((c) => c.saldo != null) && <MarcaPrimeraVez id="patrimonio" />}
        {d.cuentas.length > 0 && (
          <div className="fin-lista">
            {d.cuentas.map((c) => (
              <div key={c.id} className="fin-fila">
                <span className="fin-icono" aria-hidden>{c.icono || ICONO[c.tipo]}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {c.nombre}
                  <span style={{ display: "block", fontSize: 11, color: "var(--tx3)" }}>
                    {c.anioMes ? `Cierre de ${nombreMes(c.anioMes)}` : "Sin saldo todavía"}
                    {c.equivalente && ` · ${c.moneda === "ARS" ? fmtUsd(c.equivalente.usd) : fmtArs(c.equivalente.ars)}`}
                  </span>
                </span>
                <SaldoEditable saldo={c.saldo} moneda={c.moneda} etiqueta={`Saldo de ${c.nombre}`} onGuardar={(n) => hacer({ accion: "saldo", cuentaId: c.id, saldo: n }, "Saldo actualizado")} />
                <button type="button" className="fin-icono-btn" aria-label={`Archivar ${c.nombre}`} onClick={() => hacer({ accion: "archivar", cuentaId: c.id }, `${c.nombre} archivada`)}>✕</button>
              </div>
            ))}
          </div>
        )}
        {agregando && (
          <div className="fin-selector" style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <input className="fin-input" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Galicia, Mercado Pago, Efectivo…" aria-label="Nombre de la cuenta" autoFocus />
            <div className="fin-chips">
              {(["banco", "billetera", "efectivo", "broker", "cripto"] as const).map((t) => (
                <button key={t} type="button" className={`fin-chip ${nueva.tipo === t ? "activo" : ""}`} onClick={() => setNueva({ ...nueva, tipo: t })}>{ICONO[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</button>
              ))}
              {(["ARS", "USD"] as const).map((m) => <button key={m} type="button" className={`fin-chip ${nueva.moneda === m ? "activo" : ""}`} onClick={() => setNueva({ ...nueva, moneda: m })}>{m}</button>)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="fin-btn secundario" onClick={() => setAgregando(false)}>Cancelar</button>
              <button
                type="button"
                className="fin-btn primario"
                style={{ flex: 1 }}
                disabled={!nueva.nombre.trim()}
                onClick={async () => { await hacer({ accion: "cuenta", cuenta: nueva }, `${nueva.nombre} agregada`); setNueva({ nombre: "", tipo: "banco", moneda: "ARS" }); setAgregando(false); }}
              >
                Agregar cuenta
              </button>
            </div>
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--tx3)" }}>Los saldos se actualizan en cada cierre de mes. Tocá un saldo para corregirlo.</p>
      </section>

      {aviso && <div className="fin-toast" role="status">{aviso}</div>}
    </>
  );
}

export default function PaginaPatrimonio() {
  return (
    <Suspense fallback={<div style={{ color: "var(--tx3)" }}>Cargando…</div>}>
      <Patrimonio />
    </Suspense>
  );
}
