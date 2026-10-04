"use client";
// Pasos compartidos entre la revisión quincenal (spec §6.3) y el cierre de mes (spec §6.4):
// fijos y cuotas pendientes, y carga de variables.
import { useState } from "react";
import CargaVoz from "./CargaVoz";
import { formatearTexto, montoDeTexto, textoDeMonto } from "./Teclado";
import type { DatosCarga } from "@/lib/finanzas/carga";
import { fmtArs } from "@/lib/finanzas/dinero";
import { nombreMes } from "@/lib/finanzas/fechas";
import type { DatosRevision, Pendiente } from "@/lib/finanzas/revision";

export async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo guardar. Probá de nuevo.");
  return j;
}

export function vibrar(ms = 12) {
  try { navigator.vibrate?.(ms); } catch {}
}

const GRUPOS: { titulo: string; filtro: (p: Pendiente) => boolean; verbo: string }[] = [
  { titulo: "Gastos fijos", filtro: (p) => p.tipo === "gasto" && !p.esCuota, verbo: "Pagado" },
  { titulo: "Cuotas", filtro: (p) => p.esCuota, verbo: "Pagada" },
  { titulo: "Por cobrar", filtro: (p) => p.tipo === "ingreso", verbo: "Cobrado" },
  { titulo: "Ahorro", filtro: (p) => p.tipo === "ahorro", verbo: "Separado" },
];

// ─── Paso 1: fijos y cuotas ─────────────────────────────────────

function FilaPendiente({ p, estado, onPagar, onNoAplica, onDeshacer }: {
  p: Pendiente;
  estado: "pendiente" | "pagado" | "no_aplica";
  onPagar: (monto: number) => void;
  onNoAplica: () => void;
  onDeshacer: () => void;
}) {
  const [monto, setMonto] = useState(p.monto);
  const [editando, setEditando] = useState(false);
  const hecho = estado !== "pendiente";
  const simbolo = p.moneda === "USD" ? "US$" : "$";
  return (
    <div className="fin-fila" style={{ opacity: estado === "no_aplica" ? 0.5 : 1, gap: 8 }}>
      <button
        type="button"
        onClick={() => (hecho ? onDeshacer() : onPagar(monto))}
        aria-pressed={estado === "pagado"}
        aria-label={hecho ? `Deshacer ${p.concepto}` : `Marcar ${p.concepto} como pagado`}
        style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "transparent", border: "none", padding: 0, textAlign: "left", minHeight: 44 }}
      >
        <span
          aria-hidden
          className={estado === "pagado" ? "fin-celebrar" : undefined}
          style={{ width: 28, height: 28, borderRadius: 999, border: `2px solid ${estado === "pagado" ? "var(--sal)" : "var(--bd)"}`, background: estado === "pagado" ? "var(--sal)" : "transparent", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 700 }}
        >
          {estado === "pagado" ? "✓" : ""}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: estado === "no_aplica" ? "line-through" : undefined }}>
            {p.categoria.icono} {p.concepto}
          </span>
          <span style={{ fontSize: 11, color: "var(--tx3)" }}>
            {estado === "no_aplica" ? "No aplica este mes · tocá para deshacer" : estado === "pagado" ? "Listo · tocá para deshacer" : p.diaVencimiento ? `Vence el ${p.diaVencimiento}` : p.tarjeta ? `💳 ${p.tarjeta}` : "Tocá para marcarlo"}
          </span>
        </span>
      </button>
      {editando && !hecho ? (
        <input
          className="inline"
          autoFocus
          inputMode="decimal"
          defaultValue={textoDeMonto(monto)}
          aria-label={`Monto de ${p.concepto}`}
          style={{ width: 110, textAlign: "right", background: "transparent", border: "none", borderBottom: "1px dashed var(--acc)", borderRadius: 0, padding: "6px 0", fontWeight: 600 }}
          onBlur={(e) => { const n = montoDeTexto(e.target.value.replace(/\./g, "")); if (n) setMonto(n); setEditando(false); }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <button
          type="button"
          disabled={hecho}
          onClick={() => setEditando(true)}
          aria-label={`Editar monto de ${p.concepto}`}
          style={{ background: "transparent", border: "none", padding: "6px 0", minHeight: 44, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: monto !== p.monto ? "var(--amb-t)" : "var(--tx)" }}
        >
          {simbolo} {formatearTexto(textoDeMonto(monto))}
        </button>
      )}
      {!hecho && !p.esCuota && (
        <button type="button" className="fin-chip" onClick={onNoAplica} style={{ flexShrink: 0 }}>No aplica</button>
      )}
    </div>
  );
}

export function PasoFijos({ d, onSiguiente }: { d: DatosRevision; onSiguiente: () => void }) {
  const [pagados, setPagados] = useState<Record<string, string>>({}); // itemId → registroId
  const [noAplica, setNoAplica] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const anioMes = d.revision.anioMes;

  async function pagar(lista: { itemId: string; monto?: number }[]) {
    vibrar();
    // Optimista: se tilda al instante
    setPagados((prev) => ({ ...prev, ...Object.fromEntries(lista.map((x) => [x.itemId, "…"])) }));
    try {
      const r: { pagados: { itemId: string; registroId: string }[] } = await api("/api/finanzas/revision/pagar", "POST", { anioMes, items: lista });
      setPagados((prev) => ({ ...prev, ...Object.fromEntries(r.pagados.map((x) => [x.itemId, x.registroId])) }));
      setError(null);
    } catch (e) {
      setPagados((prev) => { const n = { ...prev }; lista.forEach((x) => delete n[x.itemId]); return n; });
      setError(e instanceof Error ? e.message : "No se pudo");
    }
  }
  async function deshacer(itemId: string) {
    if (noAplica.has(itemId)) {
      setNoAplica((s) => { const n = new Set(s); n.delete(itemId); return n; });
      await api(`/api/finanzas/presupuesto/items/${itemId}`, "PATCH", { activo: true }).catch(() => {});
      return;
    }
    const registroId = pagados[itemId];
    setPagados((prev) => { const n = { ...prev }; delete n[itemId]; return n; });
    if (registroId && registroId !== "…") await api("/api/finanzas/registros", "DELETE", { ids: [registroId] }).catch(() => {});
  }
  async function noAplicaItem(itemId: string) {
    vibrar(8);
    setNoAplica((s) => new Set(s).add(itemId));
    await api(`/api/finanzas/presupuesto/items/${itemId}`, "PATCH", { activo: false }).catch(() => {
      setNoAplica((s) => { const n = new Set(s); n.delete(itemId); return n; });
    });
  }

  const faltan = d.pendientes.filter((p) => !pagados[p.id] && !noAplica.has(p.id));
  return (
    <>
      <h1 style={{ fontSize: 22 }}>Fijos y cuotas</h1>
      {d.pendientes.length === 0 ? (
        <div className="fin-vacio"><strong>No tenés fijos pendientes 🙌</strong>Todo lo fijo de {nombreMes(anioMes)} ya está registrado.</div>
      ) : (
        <>
          <p style={{ color: "var(--tx2)", marginTop: 0 }}>Tocá lo que ya pagaste. Si el monto cambió, tocá el monto.</p>
          {faltan.length > 1 && (
            <button type="button" className="fin-btn secundario" style={{ width: "100%", marginBottom: 10 }} onClick={() => pagar(faltan.map((p) => ({ itemId: p.id })))}>
              ✓ Marcar todos como pagados ({faltan.length})
            </button>
          )}
          {GRUPOS.map((g) => {
            const lista = d.pendientes.filter(g.filtro);
            if (!lista.length) return null;
            return (
              <section key={g.titulo} className="fin-seccion" style={{ marginTop: 12 }}>
                <div className="fin-seccion-head"><h2>{g.titulo}</h2></div>
                <div className="fin-lista">
                  {lista.map((p) => (
                    <FilaPendiente
                      key={p.id}
                      p={p}
                      estado={pagados[p.id] ? "pagado" : noAplica.has(p.id) ? "no_aplica" : "pendiente"}
                      onPagar={(monto) => pagar([{ itemId: p.id, monto }])}
                      onNoAplica={() => noAplicaItem(p.id)}
                      onDeshacer={() => deshacer(p.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
      {error && <div className="fin-aviso-dup" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      <div style={{ height: 80 }} />
      <div className="fin-barra-accion">
        <button type="button" className="fin-btn primario" onClick={onSiguiente}>
          {faltan.length ? `Siguiente (quedan ${faltan.length})` : "Siguiente"}
        </button>
      </div>
    </>
  );
}

// ─── Paso 2: variables ──────────────────────────────────────────

export function PasoVariables({ d, datos, onRecargar, onSiguiente }: { d: DatosRevision; datos: DatosCarga; onRecargar: () => void; onSiguiente: () => void }) {
  return (
    <>
      <h1 style={{ fontSize: 22 }}>¿Qué gastaste en estas semanas?</h1>
      <p style={{ color: "var(--tx2)", marginTop: 0 }}>Dictá todo junto: &quot;súper 180 lucas, nafta 40, delivery 25 con la visa&quot;.</p>
      <CargaVoz datos={datos} autoIniciar={false} onGuardado={onRecargar} onListo={onSiguiente} />
      {d.variables.length > 0 && (
        <section className="fin-seccion">
          <div className="fin-seccion-head"><h2>Lo cargado hasta ahora</h2></div>
          <div className="fin-lista">
            {d.variables.map((v) => (
              <div key={v.id} className="fin-fila">
                <span aria-hidden>{v.icono}</span>
                <span style={{ flex: 1 }}>{v.nombre}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: (v.real.ars ?? 0) === 0 ? "var(--tx3)" : "var(--tx)" }}>
                  {fmtArs(v.real.ars)} <span style={{ color: "var(--tx3)" }}>/ {fmtArs(v.previsto.ars)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <button type="button" className="fin-btn secundario" style={{ width: "100%", marginTop: 16 }} onClick={onSiguiente}>No tengo más ›</button>
      <div style={{ height: 90 }} />
    </>
  );
}
