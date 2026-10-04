"use client";
// Metas y fondo de emergencia (spec §6.8): progreso, aportado vs. objetivo, fecha estimada al ritmo actual,
// aportes por mes e historial. "Aportar" con la meta preseleccionada.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Columnas, compacto, mesCorto, SERIE } from "@/components/finanzas/Graficos";
import Teclado, { formatearTexto, montoDeTexto } from "@/components/finanzas/Teclado";
import { fmtArs, fmtPct, fmtUsd, type Moneda } from "@/lib/finanzas/dinero";
import { nombreMes } from "@/lib/finanzas/fechas";
import type { MetaDetalle } from "@/lib/finanzas/metas";

const fmt = (n: number | null | undefined, m: Moneda) => (m === "USD" ? fmtUsd(n) : fmtArs(n));

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo guardar");
  return j;
}

// ─── Hoja: aportar o retirar ────────────────────────────────────

function HojaAporte({ meta, onCerrar, onHecho }: { meta: MetaDetalle; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [valor, setValor] = useState("");
  const [moneda, setMoneda] = useState<Moneda>(meta.moneda);
  const [retiro, setRetiro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monto = montoDeTexto(valor);
  async function guardar() {
    if (!monto) return;
    try {
      await api(`/api/finanzas/metas/${meta.id}/aportar`, "POST", { monto: retiro ? -monto : monto, moneda });
      try { navigator.vibrate?.(20); } catch {}
      onHecho(retiro ? `Retiraste ${fmt(monto, moneda)} de ${meta.nombre}` : `Aportaste ${fmt(monto, moneda)} a ${meta.nombre} 🎉`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo");
    }
  }
  return (
    <>
      <div className="fin-hoja-fondo" onClick={onCerrar} />
      <div className="fin-hoja" role="dialog" aria-modal="true" aria-label={`Aportar a ${meta.nombre}`}>
        <div className="fin-hoja-asa" />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ flex: 1 }}>{meta.icono} {meta.nombre}</strong>
          {(["ARS", "USD"] as const).map((m) => <button key={m} type="button" className={`fin-chip ${moneda === m ? "activo" : ""}`} onClick={() => setMoneda(m)}>{m}</button>)}
        </div>
        <div className="fin-chips" style={{ marginTop: 8 }}>
          <button type="button" className={`fin-chip ${!retiro ? "activo" : ""}`} onClick={() => setRetiro(false)}>Aportar</button>
          <button type="button" className={`fin-chip ${retiro ? "activo" : ""}`} onClick={() => setRetiro(true)}>Retirar</button>
        </div>
        <div className="fin-monto-display" aria-live="polite">
          {valor ? `${retiro ? "−" : ""}${moneda === "USD" ? "US$ " : "$ "}${formatearTexto(valor)}` : <span className="vacio">{moneda === "USD" ? "US$ 0" : "$ 0"}</span>}
        </div>
        <Teclado valor={valor} onChange={setValor} />
        {error && <div className="fin-aviso-dup" role="alert" style={{ marginTop: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" className="fin-btn secundario" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="fin-btn primario" style={{ flex: 1 }} disabled={!monto} onClick={guardar}>{retiro ? "Retirar" : "Aportar"}</button>
        </div>
      </div>
    </>
  );
}

// ─── Hoja: nueva meta ───────────────────────────────────────────

function HojaNueva({ fondoExiste, inicialFondo, onCerrar, onHecho }: { fondoExiste: boolean; inicialFondo: boolean; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [tipo, setTipo] = useState<"meta" | "fondo_emergencia">(inicialFondo && !fondoExiste ? "fondo_emergencia" : "meta");
  const [nombre, setNombre] = useState("");
  const [icono, setIcono] = useState("🎯");
  const [objetivo, setObjetivo] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("USD");
  const [meses, setMeses] = useState(6);
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function crear() {
    try {
      await api("/api/finanzas/metas", "POST", {
        tipo, nombre, icono, moneda, mesesCobertura: meses, fechaObjetivo: fecha || null,
        montoObjetivo: montoDeTexto(objetivo.replace(/\./g, "")),
      });
      onHecho(tipo === "fondo_emergencia" ? "Fondo de emergencia creado 🛟" : `Meta "${nombre}" creada 🎯`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo");
    }
  }
  return (
    <>
      <div className="fin-hoja-fondo" onClick={onCerrar} />
      <div className="fin-hoja" role="dialog" aria-modal="true" aria-label="Nueva meta" style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <div className="fin-hoja-asa" />
        <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Nueva meta</h2>
        {!fondoExiste && (
          <div className="fin-chips" style={{ marginBottom: 10 }}>
            <button type="button" className={`fin-chip ${tipo === "fondo_emergencia" ? "activo" : ""}`} onClick={() => setTipo("fondo_emergencia")}>🛟 Fondo de emergencia</button>
            <button type="button" className={`fin-chip ${tipo === "meta" ? "activo" : ""}`} onClick={() => setTipo("meta")}>🎯 Otra meta</button>
          </div>
        )}
        {tipo === "fondo_emergencia" ? (
          <>
            <p style={{ color: "var(--tx2)", marginTop: 0 }}>Plata para imprevistos: el objetivo se calcula solo con tus gastos esenciales de los últimos meses. ¿Cuántos meses querés cubrir?</p>
            <div className="fin-chips">
              {[3, 4, 6, 9, 12].map((n) => <button key={n} type="button" className={`fin-chip ${meses === n ? "activo" : ""}`} onClick={() => setMeses(n)}>{n} meses</button>)}
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="fin-input" style={{ width: 70 }} value={icono} onChange={(e) => setIcono(e.target.value)} aria-label="Ícono">
                {["🎯", "✈️", "🏠", "🚗", "💻", "🎓", "💍", "🏖️", "📈"].map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
              <input className="fin-input" style={{ flex: 1 }} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Viaje, auto, notebook…" aria-label="Nombre" autoFocus />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="fin-input" style={{ flex: 1 }} inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="¿Cuánto querés juntar?" aria-label="Objetivo" />
              {(["USD", "ARS"] as const).map((m) => <button key={m} type="button" className={`fin-chip ${moneda === m ? "activo" : ""}`} onClick={() => setMoneda(m)}>{m}</button>)}
            </div>
            <label style={{ fontSize: 13, color: "var(--tx2)" }}>
              Para cuándo (opcional)
              <input className="fin-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
            </label>
          </div>
        )}
        {error && <div className="fin-aviso-dup" role="alert" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" className="fin-btn secundario" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="fin-btn primario" style={{ flex: 1 }} disabled={tipo === "meta" && (!nombre.trim() || !montoDeTexto(objetivo.replace(/\./g, "")))} onClick={crear}>Crear</button>
        </div>
      </div>
    </>
  );
}

// ─── Tarjeta de meta ────────────────────────────────────────────

function TarjetaMeta({ m, abierta, onAbrir, onAportar, onArchivar }: { m: MetaDetalle; abierta: boolean; onAbrir: () => void; onAportar: () => void; onArchivar: () => void }) {
  const fondo = m.tipo === "fondo_emergencia";
  return (
    <article className="fin-kpi" style={{ marginBottom: 10 }}>
      <button type="button" onClick={onAbrir} aria-expanded={abierta} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }} aria-hidden>{m.icono}</span>
          <strong style={{ flex: 1 }}>{m.nombre}</strong>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmt(m.aportadoMoneda, m.moneda)}{m.objetivo ? <span style={{ color: "var(--tx3)" }}> / {fmt(m.objetivo, m.moneda)}</span> : null}
          </span>
        </div>
        {fondo ? (
          <>
            <div className="fin-casilleros" role="img" aria-label={`${m.mesesCubiertos?.toFixed(1) ?? 0} de ${m.mesesCobertura} meses cubiertos`}>
              {Array.from({ length: m.mesesCobertura ?? 6 }, (_, i) => <div key={i} className={`fin-casillero ${(m.mesesCubiertos ?? 0) >= i + 1 ? "lleno" : ""}`} />)}
            </div>
            <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 6 }}>
              {m.mesesCubiertos == null
                ? "El objetivo se calcula con tus gastos esenciales: aparece al cerrar tu primer mes."
                : `${m.mesesCubiertos.toLocaleString("es-AR", { maximumFractionDigits: 1 })} de ${m.mesesCobertura} meses cubiertos · objetivo = ${m.mesesCobertura} × ${fmt(m.gastoEsencialMensual, m.moneda)} de gastos esenciales por mes`}
            </div>
          </>
        ) : (
          <>
            <div className="fin-barra" style={{ marginTop: 10 }}><div className="fin-barra-relleno" style={{ width: `${(m.progreso ?? 0) * 100}%`, background: SERIE.ahorro }} /></div>
            <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 6 }}>
              {fmtPct(m.progreso)} del objetivo
              {m.fechaObjetivo && ` · para el ${new Date(`${m.fechaObjetivo}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`}
            </div>
          </>
        )}
        <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 4 }}>
          {m.progreso === 1 ? "🎉 ¡Meta alcanzada!" : m.llegaEn ? `Al ritmo actual (${fmt(m.ritmo, m.moneda)}/mes) llegás en ${nombreMes(m.llegaEn)} ${m.llegaEn.slice(0, 4)}` : m.ritmo === 0 ? "Con aportes todos los meses te mostramos cuándo llegás" : null}
        </div>
      </button>

      {abierta && (
        <div style={{ marginTop: 12 }}>
          {m.porMes.some((x) => x.monto !== 0) ? (
            <>
              <div style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 6 }}>Aportes por mes</div>
              <Columnas etiquetas={m.porMes.map((x) => mesCorto(x.anioMes))} series={[{ nombre: "Aportes", color: SERIE.ahorro, valores: m.porMes.map((x) => Math.max(0, x.monto)) }]} formato={(n) => compacto(n, m.moneda === "USD" ? "US$ " : "$ ")} formatoDetalle={(n) => fmt(n, m.moneda)} alto={150} />
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--tx3)" }}>Todavía no hay aportes. El primero es el más importante.</div>
          )}
          {m.historial.length > 0 && (
            <div className="fin-lista" style={{ marginTop: 10 }}>
              {m.historial.slice(0, 10).map((h) => (
                <div key={h.id} className="fin-fila" style={{ minHeight: 40 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{h.descripcion}<span style={{ display: "block", fontSize: 11, color: "var(--tx3)" }}>{nombreMes(h.anioMes)} {h.anioMes.slice(0, 4)}</span></span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: h.monto < 0 ? "var(--amb-t)" : "var(--tx)" }}>{h.monto < 0 ? "−" : "+"}{fmt(Math.abs(h.monto), m.moneda)}</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="fin-link" onClick={onArchivar} style={{ marginTop: 6, color: "var(--tx3)" }}>Archivar meta</button>
        </div>
      )}
      <button type="button" className="fin-btn primario" style={{ width: "100%", marginTop: 12 }} onClick={onAportar}>Aportar</button>
    </article>
  );
}

// ─── Página ─────────────────────────────────────────────────────

function Metas() {
  const sp = useSearchParams();
  const router = useRouter();
  const [metas, setMetas] = useState<MetaDetalle[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(sp.get("id"));
  const [aporte, setAporte] = useState<MetaDetalle | null>(null);
  const [nueva, setNueva] = useState(!!sp.get("nueva"));
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/finanzas/metas", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r) setMetas(r);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (!metas) return <div style={{ color: "var(--tx3)" }}>Cargando…</div>;
  const fondoExiste = metas.some((m) => m.tipo === "fondo_emergencia");
  const hecho = (t: string) => { setAporte(null); setNueva(false); setAviso(t); cargar(); if (sp.get("nueva")) router.replace("/finanzas/metas"); };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Metas</h1>
        <button type="button" className="fin-btn secundario" onClick={() => setNueva(true)}>➕ Nueva</button>
      </div>
      <div style={{ marginTop: 14 }}>
        {metas.length === 0 ? (
          <div className="fin-vacio">
            <strong>Todavía no tenés metas</strong>
            Una buena primera meta es un fondo de emergencia: entre 3 y 6 meses de tus gastos esenciales, para que un imprevisto no te desarme.
            <div style={{ marginTop: 10 }}><button type="button" className="fin-btn primario" onClick={() => setNueva(true)}>🛟 Crear mi fondo de emergencia</button></div>
          </div>
        ) : (
          metas.map((m) => (
            <TarjetaMeta
              key={m.id}
              m={m}
              abierta={abierta === m.id}
              onAbrir={() => setAbierta(abierta === m.id ? null : m.id)}
              onAportar={() => setAporte(m)}
              onArchivar={async () => { await api(`/api/finanzas/metas/${m.id}`, "PATCH", { activa: false }).catch(() => {}); setAviso(`${m.nombre} archivada`); cargar(); }}
            />
          ))
        )}
      </div>
      <Link href="/finanzas/estadisticas" className="fin-link">Ver aportes en Estadísticas ›</Link>

      {aporte && <HojaAporte meta={aporte} onCerrar={() => setAporte(null)} onHecho={hecho} />}
      {nueva && <HojaNueva fondoExiste={fondoExiste} inicialFondo={sp.get("nueva") === "fondo_emergencia" || !fondoExiste} onCerrar={() => setNueva(false)} onHecho={hecho} />}
      {aviso && <div className="fin-toast" role="status">{aviso}</div>}
    </>
  );
}

export default function PaginaMetas() {
  return (
    <Suspense fallback={<div style={{ color: "var(--tx3)" }}>Cargando…</div>}>
      <Metas />
    </Suspense>
  );
}
