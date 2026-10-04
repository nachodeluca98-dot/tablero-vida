"use client";
// Revisión quincenal (spec §6.3): asistente de 3 pasos, retomable. Exprés = solo fijos.
// 1. Fijos y cuotas pendientes  2. Variables (dictado)  3. Así vas
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import AsistenteCierre from "@/components/finanzas/AsistenteCierre";
import Montos from "@/components/finanzas/Montos";
import { api, PasoFijos, PasoVariables, vibrar } from "@/components/finanzas/PasosRevision";
import type { DatosCarga } from "@/lib/finanzas/carga";
import { fmtArs, fmtPct } from "@/lib/finanzas/dinero";
import { anioMesActual, nombreMes } from "@/lib/finanzas/fechas";
import type { DatosRevision } from "@/lib/finanzas/revision";

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// ─── Paso 3: así vas ────────────────────────────────────────────

function PasoAsiVas({ d, onRecargar, onTerminar, terminando }: { d: DatosRevision; onRecargar: () => void; onTerminar: () => void; terminando: boolean }) {
  const p = d.presupuesto;
  const r = p.resumen;
  const usado = r.gastos.previsto.ars ? (r.gastos.real.ars ?? 0) / r.gastos.previsto.ars : null;
  const tasa = r.ingresos.real.ars ? (r.ahorro.real.ars ?? 0) / r.ingresos.real.ars : null;
  // El ritmo se mide en los variables: los fijos (alquiler, cuotas) se pagan de golpe y no dicen nada del ritmo
  const varPrevisto = d.variables.reduce((t, v) => t + (v.previsto.ars ?? 0), 0);
  const varReal = d.variables.reduce((t, v) => t + (v.real.ars ?? 0), 0);
  const ritmo = varPrevisto > 0
    ? varReal / varPrevisto <= p.mesTranscurrido + 0.05
      ? `En los variables vas a buen ritmo: ${fmtArs(varReal)} de ${fmtArs(varPrevisto)}. ¡Bien!`
      : `En los variables vas un poco adelantado: ${fmtArs(varReal)} de ${fmtArs(varPrevisto)}. Todavía hay margen para acomodarlo.`
    : null;
  const nombre = (id: string) => p.grupos.find((g) => g.id === id)?.nombre ?? "";
  const [cubiertos, setCubiertos] = useState<Set<string>>(new Set());
  const pasadas = p.grupos.filter((g) => g.tipo === "gasto" && (g.previsto.ars ?? 0) > 0 && (g.real.ars ?? 0) > (g.previsto.ars ?? 0));

  async function cubrir(s: { origen: string; destino: string; monto: number }) {
    vibrar();
    setCubiertos((c) => new Set(c).add(s.destino));
    await api("/api/finanzas/presupuesto/reasignar", "POST", { anioMes: d.revision.anioMes, ...s }).catch(() => {
      setCubiertos((c) => { const n = new Set(c); n.delete(s.destino); return n; });
    });
    onRecargar();
  }

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Así vas en {nombreMes(d.revision.anioMes)}</h1>
      {usado != null ? (
        <div className="fin-kpi">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
            <span>Gastaste <strong>{fmtArs(r.gastos.real.ars)}</strong> de {fmtArs(r.gastos.previsto.ars)}</span>
            <span style={{ color: "var(--tx3)" }}>pasó {fmtPct(p.mesTranscurrido)} del mes</span>
          </div>
          <div className="fin-barra">
            <div className="fin-barra-relleno" style={{ width: `${Math.min(100, usado * 100)}%` }} />
            <div className="fin-barra-marca" style={{ left: `calc(${Math.min(100, p.mesTranscurrido * 100)}% - 1px)` }} />
          </div>
          {ritmo && <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 6 }}>{ritmo}</div>}
        </div>
      ) : (
        <div className="fin-vacio">Todavía no hay presupuesto de gastos este mes para comparar.</div>
      )}
      <div className="fin-kpis" style={{ marginTop: 8 }}>
        <div className="fin-kpi">
          <div className="fin-kpi-label">Tasa de ahorro</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtPct(tasa)}</div>
          {tasa == null && <div style={{ fontSize: 11, color: "var(--tx3)" }}>Aparece cuando registres lo que cobraste</div>}
        </div>
        <div className="fin-kpi"><div className="fin-kpi-label">Ahorro</div><Montos ars={r.ahorro.real.ars} usd={r.ahorro.real.usd} /></div>
      </div>

      {pasadas.length > 0 && (
        <section className="fin-seccion">
          <div className="fin-seccion-head"><h2>Para acomodar</h2></div>
          {pasadas.map((g) => {
            const s = p.sugerencias.find((x) => x.destino === g.id);
            return (
              <div key={g.id} className="fin-aviso-dup" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1 }}>
                  {g.icono} {g.nombre} se pasó {fmtArs((g.real.ars ?? 0) - (g.previsto.ars ?? 0))}.
                  {s && !cubiertos.has(g.id) && ` Podés cubrirlo desde ${nombre(s.origen)}.`}
                  {cubiertos.has(g.id) && " Cubierto ✓"}
                </span>
                {s && !cubiertos.has(g.id) && (
                  <button type="button" className="fin-btn secundario" onClick={() => cubrir(s)}>Cubrir {fmtArs(s.monto)}</button>
                )}
              </div>
            );
          })}
        </section>
      )}
      <div style={{ height: 80 }} />
      <div className="fin-barra-accion">
        <button type="button" className="fin-btn primario" disabled={terminando} onClick={onTerminar}>{terminando ? "Guardando…" : "Terminar revisión"}</button>
      </div>
    </>
  );
}

// ─── Final: devolución positiva ─────────────────────────────────

function Terminada({ d }: { d: DatosRevision }) {
  return (
    <div className="fin-celebrar" style={{ textAlign: "center", paddingTop: 32 }}>
      <div style={{ fontSize: 56 }} aria-hidden>🎉</div>
      <h1 style={{ marginTop: 8 }}>¡Revisión lista!</h1>
      <p style={{ color: "var(--tx2)" }}>Tus finanzas de {nombreMes(d.revision.anioMes)} están al día.</p>
      {d.racha >= 2 && <p style={{ color: "var(--amb-t)", fontWeight: 600 }}>🔥 {d.racha} revisiones seguidas</p>}
      {d.proxima && <p style={{ color: "var(--tx3)" }}>Próxima revisión: {fechaLarga(d.proxima)}.</p>}
      <Link href="/finanzas" className="fin-btn primario" style={{ marginTop: 12 }}>Ir a Inicio</Link>
    </div>
  );
}

// ─── Página ─────────────────────────────────────────────────────

function Revision() {
  const router = useRouter();
  const sp = useSearchParams();
  const tipo = sp.get("tipo") === "cierre" ? "cierre" : "quincenal";
  const mes = sp.get("mes") && /^\d{4}-\d{2}$/.test(sp.get("mes")!) ? sp.get("mes")! : anioMesActual();
  // El cierre no tiene exprés ni pantalla de elección: siempre es el asistente completo
  const modoUrl = tipo === "cierre" ? "completo" : sp.get("modo") === "expres" ? "expres" : sp.get("modo") === "completo" ? "completo" : null;

  const [d, setD] = useState<DatosRevision | null>(null);
  const [elegir, setElegir] = useState(false);
  const [datos, setDatos] = useState<DatosCarga | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminando, setTerminando] = useState(false);

  const iniciar = useCallback(async (modo: string | null) => {
    try {
      const r = await api("/api/finanzas/revision", "POST", { tipo, mes, modo });
      if (!r.revision) { setElegir(true); return; }
      setElegir(false);
      setD(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar la revisión");
    }
  }, [tipo, mes]);

  // Un solo pedido de inicio por pantalla (evita duplicados por doble efecto o doble toque)
  const iniciado = useRef<string | null>(null);
  useEffect(() => {
    const clave = `${tipo}|${mes}|${modoUrl}`;
    if (iniciado.current === clave) return;
    iniciado.current = clave;
    iniciar(modoUrl);
  }, [iniciar, modoUrl, tipo, mes]);
  useEffect(() => {
    fetch("/api/finanzas/carga", { cache: "no-store" }).then((r) => r.json()).then(setDatos).catch(() => {});
  }, []);

  const recargar = useCallback(async () => {
    if (!d) return;
    const r = await fetch(`/api/finanzas/revision?id=${d.revision.id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.revision) setD(r);
  }, [d]);

  async function irAPaso(paso: number) {
    if (!d) return;
    window.scrollTo({ top: 0 });
    const r = await api("/api/finanzas/revision", "PATCH", { id: d.revision.id, paso }).catch(() => null);
    if (r) setD(r);
  }
  async function terminar() {
    if (!d) return;
    setTerminando(true);
    const r = await api("/api/finanzas/revision", "PATCH", { id: d.revision.id, completar: true }).catch(() => null);
    setTerminando(false);
    if (r) { vibrar(30); setD(r); window.scrollTo({ top: 0 }); }
  }
  async function saltear() {
    const r = await api("/api/finanzas/revision", "POST", { tipo, mes, modo: "expres" }).catch(() => null);
    if (r?.revision) await api("/api/finanzas/revision", "PATCH", { id: r.revision.id, saltear: true }).catch(() => null);
    router.push("/finanzas");
  }

  if (error) return <div className="fin-vacio">{error}</div>;

  // Elegir completa o exprés (spec §6.3)
  if (elegir) {
    return (
      <div style={{ paddingTop: 8 }}>
        <h1>Revisión de la quincena</h1>
        <p style={{ color: "var(--tx2)" }}>Ponete al día con {nombreMes(mes)} en un par de minutos.</p>
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" className="fin-opcion-grande principal" onClick={() => iniciar("completo")}>
            <span className="ico" aria-hidden>📋</span>
            <span>Revisión completa<small>Fijos, variables y cómo vas · unos 5 minutos</small></span>
          </button>
          <button type="button" className="fin-opcion-grande secundaria" onClick={() => iniciar("expres")}>
            <span className="ico" aria-hidden>⚡</span>
            <span>Exprés<small>Solo los fijos · 1 minuto</small></span>
          </button>
        </div>
        <button type="button" className="fin-link" style={{ marginTop: 16 }} onClick={saltear}>Esta vez la salteo</button>
      </div>
    );
  }

  if (!d) return <div style={{ color: "var(--tx3)" }}>Cargando…</div>;
  if (d.revision.tipo === "cierre") {
    if (d.revision.estado === "completa") return <Terminada d={d} />;
    return <AsistenteCierre d={d} datos={datos} onRecargar={recargar} irAPaso={irAPaso} onTerminado={() => router.push("/finanzas")} />;
  }
  if (d.revision.estado === "completa") return <Terminada d={d} />;

  const expres = d.revision.modo === "expres";
  const pasos = expres ? [1, 3] : [1, 2, 3];
  const idx = Math.max(0, pasos.indexOf(d.revision.paso));
  const paso = pasos[idx];
  const siguiente = () => irAPaso(pasos[Math.min(idx + 1, pasos.length - 1)]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button type="button" className="fin-icono-btn" aria-label={idx === 0 ? "Salir (se guarda dónde quedaste)" : "Atrás"} onClick={() => (idx === 0 ? router.push("/finanzas") : irAPaso(pasos[idx - 1]))}>
          {idx === 0 ? "✕" : "‹"}
        </button>
        <div className="fin-barra" style={{ flex: 1 }} role="progressbar" aria-valuenow={idx + 1} aria-valuemax={pasos.length} aria-label="Progreso">
          <div className="fin-barra-relleno" style={{ width: `${((idx + 1) / pasos.length) * 100}%` }} />
        </div>
        <span style={{ fontSize: 12, color: "var(--tx3)" }}>{expres ? "⚡ " : ""}{idx + 1}/{pasos.length}</span>
      </div>

      {paso === 1 && <PasoFijos key={`f-${d.revision.id}`} d={d} onSiguiente={siguiente} />}
      {paso === 2 && datos && <PasoVariables d={d} datos={datos} onRecargar={recargar} onSiguiente={siguiente} />}
      {paso === 3 && <PasoAsiVas d={d} onRecargar={recargar} onTerminar={terminar} terminando={terminando} />}
    </>
  );
}

export default function PaginaRevision() {
  return (
    <Suspense fallback={<div style={{ color: "var(--tx3)" }}>Cargando…</div>}>
      <Revision />
    </Suspense>
  );
}
