"use client";
// Revisión quincenal (spec §6.3): asistente de 3 pasos, retomable. Exprés = solo fijos.
// 1. Fijos y cuotas pendientes  2. Variables (dictado)  3. Así vas
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import CargaVoz from "@/components/finanzas/CargaVoz";
import Montos from "@/components/finanzas/Montos";
import { formatearTexto, montoDeTexto, textoDeMonto } from "@/components/finanzas/Teclado";
import type { DatosCarga } from "@/lib/finanzas/carga";
import { fmtArs, fmtPct } from "@/lib/finanzas/dinero";
import { anioMesActual, nombreMes } from "@/lib/finanzas/fechas";
import type { DatosRevision, Pendiente } from "@/lib/finanzas/revision";

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo guardar. Probá de nuevo.");
  return j;
}

function vibrar(ms = 12) {
  try { navigator.vibrate?.(ms); } catch {}
}

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

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

function PasoFijos({ d, onSiguiente }: { d: DatosRevision; onSiguiente: () => void }) {
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

function PasoVariables({ d, datos, onRecargar, onSiguiente }: { d: DatosRevision; datos: DatosCarga; onRecargar: () => void; onSiguiente: () => void }) {
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
  const modoUrl = sp.get("modo") === "expres" ? "expres" : sp.get("modo") === "completo" ? "completo" : null;

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

  if (tipo === "cierre") {
    return (
      <div className="fin-vacio">
        <strong>Cierre de {nombreMes(mes)}</strong>
        El asistente de cierre y apertura de mes (patrimonio, metas y el presupuesto del mes que viene) es lo próximo que se construye.
        Mientras tanto podés hacer la revisión de fijos y variables del mes.
        <div style={{ marginTop: 12 }}><Link href={`/finanzas/revision?tipo=quincenal&mes=${mes}`} className="fin-btn secundario">Revisar {nombreMes(mes)}</Link></div>
      </div>
    );
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
