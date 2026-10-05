"use client";
// Movimientos (spec §6.6): lista por día, buscador, filtros como chips, detalle editable y deslizar para eliminar.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DetalleMovimiento from "@/components/finanzas/DetalleMovimiento";
import GrillaCategorias from "@/components/finanzas/GrillaCategorias";
import MarcaPrimeraVez from "@/components/finanzas/MarcaPrimeraVez";
import Montos from "@/components/finanzas/Montos";
import { MEDIOS_PAGO, MEDIO_LABEL } from "@/lib/finanzas/borrador";
import type { DatosCarga } from "@/lib/finanzas/carga";
import { fmtArs, fmtUsd, sumarMontos } from "@/lib/finanzas/dinero";
import { anioMesActual, hoyISO, nombreMes, sumarMeses } from "@/lib/finanzas/fechas";
import type { Movimiento } from "@/lib/finanzas/movimientos";

type Lista = { movimientos: Movimiento[]; hayMas: boolean };

const FILTROS = ["mes", "desde", "hasta", "q", "categoria", "tipo", "medio", "tarjeta", "sinClasificar", "aprox", "compartido"] as const;
type Filtro = (typeof FILTROS)[number];
const TIPO_LABEL: Record<string, string> = { gasto: "Gastos", ingreso: "Ingresos", ahorro: "Ahorro" };

function tituloDia(iso: string) {
  const hoy = hoyISO();
  if (iso === hoy) return "Hoy";
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  if (iso === ayer) return "Ayer";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

// Fila con deslizar a la izquierda para eliminar (el detalle tiene el botón equivalente, spec §2.2.7)
function FilaMovimiento({ m, onAbrir, onEliminar }: { m: Movimiento; onAbrir: () => void; onEliminar: () => void }) {
  const [dx, setDx] = useState(0);
  const inicio = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const UMBRAL = 96;

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 18, color: dx < -UMBRAL ? "var(--tx)" : "var(--tx3)" }}>
        🗑 Eliminar
      </div>
      <button
        type="button"
        className="fin-fila"
        style={{ width: "100%", background: "var(--bg2)", border: "none", borderRadius: 0, textAlign: "left", transform: `translateX(${dx}px)`, transition: inicio.current ? "none" : "transform .2s", touchAction: "pan-y" }}
        onPointerDown={(e) => { inicio.current = { x: e.clientX, y: e.clientY, horizontal: null }; }}
        onPointerMove={(e) => {
          const s = inicio.current;
          if (!s) return;
          const mx = e.clientX - s.x, my = e.clientY - s.y;
          if (s.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.horizontal = Math.abs(mx) > Math.abs(my);
          if (s.horizontal) setDx(Math.min(0, mx));
        }}
        onPointerUp={() => {
          const s = inicio.current;
          inicio.current = null;
          if (s?.horizontal) {
            if (dx < -UMBRAL) onEliminar();
            setDx(0);
          } else if (s) onAbrir();
        }}
        onPointerCancel={() => { inicio.current = null; setDx(0); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
        aria-label={`${m.descripcion || m.categoria?.nombre || "Movimiento"}, abrir detalle`}
      >
        <div className="fin-icono" aria-hidden>{m.categoria?.icono || (m.tipo === "ingreso" ? "💰" : m.tipo === "ahorro" ? "🐷" : "❔")}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.descripcion || m.categoria?.nombre || "Sin descripción"}
            {m.esAproximado && <span className="fin-marca" title="Aproximado">≈</span>}
            {m.compartido && <span className="fin-marca" title="Compartido">👥</span>}
            {m.cuotaNumero != null && <span className="fin-marca">{m.cuotaNumero}/{m.cuotasTotal}</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--tx3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.categoria?.nombre || <span style={{ color: "var(--amb-t)" }}>Sin clasificar</span>}
            {m.tipo !== "gasto" && ` · ${TIPO_LABEL[m.tipo]}`}
            {m.tarjeta && ` · 💳 ${m.tarjeta}`}
            {m.incluye && ` · ${m.incluye}`}
          </div>
        </div>
        <Montos ars={m.montoArs} usd={m.montoUsd} original={m.moneda} />
      </button>
    </div>
  );
}

function Movimientos() {
  const router = useRouter();
  const sp = useSearchParams();
  const [datos, setDatos] = useState<DatosCarga | null>(null);
  const [lista, setLista] = useState<Lista | null>(null);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState(sp.get("q") ?? "");
  const [selector, setSelector] = useState<null | "categoria" | "medio">(null);
  const [abierto, setAbierto] = useState<Movimiento | null>(null);
  const [borrando, setBorrando] = useState<Movimiento[]>([]);
  const timerBorrado = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filtros en la URL: se pueden compartir y vienen de Inicio/Estadísticas (spec §5.2, §10)
  const filtros = useMemo(() => {
    const f = Object.fromEntries(FILTROS.map((k) => [k, sp.get(k)])) as Record<Filtro, string | null>;
    if (!sp.has("mes") && !sp.has("desde") && !sp.has("hasta")) f.mes = anioMesActual();
    return f;
  }, [sp]);

  const setFiltro = useCallback((k: Filtro, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v === null || v === "") p.delete(k);
    else p.set(k, v);
    if (k === "mes" && v === null) p.set("mes", "todo");
    p.delete("id");
    router.replace(`/finanzas/movimientos?${p.toString()}`, { scroll: false });
  }, [router, sp]);

  useEffect(() => {
    fetch("/api/finanzas/carga", { cache: "no-store" }).then((r) => r.json()).then(setDatos).catch(() => setError(true));
  }, []);

  const cargar = useCallback(async () => {
    const p = new URLSearchParams();
    for (const k of FILTROS) {
      const v = filtros[k];
      if (v && !(k === "mes" && v === "todo")) p.set(k, v);
    }
    try {
      const r = await fetch(`/api/finanzas/movimientos?${p.toString()}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setLista(await r.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  // Buscador: espera a que deje de tipear
  useEffect(() => {
    if ((filtros.q ?? "") === busqueda) return;
    const t = setTimeout(() => setFiltro("q", busqueda.trim() || null), 300);
    return () => clearTimeout(t);
  }, [busqueda, filtros.q, setFiltro]);

  // ?id= abre el detalle (desde Inicio)
  const idDeUrl = useRef<string | null>(null);
  useEffect(() => {
    const id = sp.get("id");
    if (!id || idDeUrl.current === id) return;
    idDeUrl.current = id; // cada id de la URL se abre una sola vez
    fetch(`/api/finanzas/movimientos/${id}`).then((r) => (r.ok ? r.json() : null)).then((m) => m && setAbierto(m)).catch(() => {});
  }, [sp]);

  // Eliminar sin confirmar: se oculta, se ofrece Deshacer y recién después se borra (spec §2.2.5)
  const confirmarBorrado = useCallback((ms: Movimiento[]) => {
    if (!ms.length) return;
    fetch("/api/finanzas/registros", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ms.map((m) => m.id) }), keepalive: true,
    }).then(() => cargar()).catch(() => {});
  }, [cargar]);

  function eliminar(m: Movimiento) {
    try { navigator.vibrate?.(15); } catch {}
    setAbierto(null);
    setBorrando((prev) => {
      const nuevos = [...prev, m];
      if (timerBorrado.current) clearTimeout(timerBorrado.current);
      timerBorrado.current = setTimeout(() => { confirmarBorrado(nuevos); setBorrando([]); }, 5000);
      return nuevos;
    });
  }

  // Al salir de la pantalla, lo que estaba esperando el Deshacer se borra igual
  const borrandoRef = useRef(borrando);
  borrandoRef.current = borrando;
  const confirmarRef = useRef(confirmarBorrado);
  confirmarRef.current = confirmarBorrado;
  useEffect(() => () => {
    if (timerBorrado.current) clearTimeout(timerBorrado.current);
    confirmarRef.current(borrandoRef.current);
  }, []);

  function cerrarDetalle() {
    setAbierto(null);
    if (sp.get("id")) {
      const p = new URLSearchParams(sp.toString());
      p.delete("id");
      router.replace(`/finanzas/movimientos?${p.toString()}`, { scroll: false });
    }
  }

  const visibles = useMemo(
    () => (lista?.movimientos ?? []).filter((m) => !borrando.some((b) => b.id === m.id)),
    [lista, borrando]
  );
  const porDia = useMemo(() => {
    const g = new Map<string, Movimiento[]>();
    for (const m of visibles) g.set(m.fecha, [...(g.get(m.fecha) ?? []), m]);
    return Array.from(g.entries());
  }, [visibles]);
  const totales = useMemo(() => {
    const t = (tipo: string) => sumarMontos(visibles.filter((m) => m.tipo === tipo).map((m) => ({ ars: m.montoArs, usd: m.montoUsd })));
    return { gastos: t("gasto"), ingresos: t("ingreso") };
  }, [visibles]);

  const mes = filtros.mes === "todo" ? null : filtros.mes;
  const cat = datos?.categorias.find((c) => c.id === filtros.categoria);
  const hayFiltros = FILTROS.some((k) => k !== "mes" && k !== "desde" && k !== "hasta" && filtros[k]);
  const sinClasificarVisibles = visibles.filter((m) => !m.categoriaId).length;

  return (
    <>
      <h1>Movimientos</h1>

      <input
        className="fin-input"
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar: súper, nafta, coto…"
        aria-label="Buscar movimientos"
        style={{ width: "100%" }}
      />

      {/* Período: un rango que viene de Estadísticas, o el selector de mes */}
      {(filtros.desde || filtros.hasta) ? (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="fin-chip activo" onClick={() => router.replace(`/finanzas/movimientos?mes=${filtros.hasta ?? anioMesActual()}`, { scroll: false })}>
            {filtros.desde ? `${nombreMes(filtros.desde)} ${filtros.desde.slice(0, 4)}` : "…"} – {filtros.hasta ? `${nombreMes(filtros.hasta)} ${filtros.hasta.slice(0, 4)}` : "hoy"} ✕
          </button>
        </div>
      ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
        <button type="button" className="fin-icono-btn" aria-label="Mes anterior" onClick={() => setFiltro("mes", sumarMeses(mes ?? anioMesActual(), -1))}>‹</button>
        <button type="button" className={`fin-chip ${mes ? "activo" : ""}`} onClick={() => setFiltro("mes", mes ? null : anioMesActual())}>
          {mes ? `${nombreMes(mes)} ${mes.slice(0, 4)}` : "Todos los meses"}
        </button>
        <button type="button" className="fin-icono-btn" aria-label="Mes siguiente" onClick={() => setFiltro("mes", sumarMeses(mes ?? anioMesActual(), 1))}>›</button>
      </div>
      )}

      {/* Filtros como chips horizontales */}
      <div className="fin-chips" style={{ flexWrap: "nowrap", overflowX: "auto", padding: "8px 0", scrollbarWidth: "none" }}>
        {(["gasto", "ingreso", "ahorro"] as const).map((t) => (
          <button key={t} type="button" className={`fin-chip ${filtros.tipo === t ? "activo" : ""}`} style={{ flexShrink: 0 }} onClick={() => setFiltro("tipo", filtros.tipo === t ? null : t)}>
            {TIPO_LABEL[t]}
          </button>
        ))}
        <button type="button" className={`fin-chip ${cat ? "activo" : ""}`} style={{ flexShrink: 0 }} onClick={() => (cat ? setFiltro("categoria", null) : setSelector(selector === "categoria" ? null : "categoria"))}>
          {cat ? <>{cat.icono} {cat.nombre} ✕</> : "Categoría ▾"}
        </button>
        <button type="button" className={`fin-chip ${filtros.medio ? "activo" : ""}`} style={{ flexShrink: 0 }} onClick={() => (filtros.medio ? setFiltro("medio", null) : setSelector(selector === "medio" ? null : "medio"))}>
          {filtros.medio ? <>{MEDIO_LABEL[filtros.medio as keyof typeof MEDIO_LABEL]} ✕</> : "Medio ▾"}
        </button>
        {datos?.tarjetas.map((t) => (
          <button key={t.id} type="button" className={`fin-chip ${filtros.tarjeta === t.id ? "activo" : ""}`} style={{ flexShrink: 0 }} onClick={() => setFiltro("tarjeta", filtros.tarjeta === t.id ? null : t.id)}>
            💳 {t.nombre}
          </button>
        ))}
        {([["sinClasificar", "Sin clasificar"], ["aprox", "≈ Aproximados"], ["compartido", "👥 Compartidos"]] as const).map(([k, l]) => (
          <button key={k} type="button" className={`fin-chip ${filtros[k] ? "activo" : ""}`} style={{ flexShrink: 0 }} onClick={() => setFiltro(k, filtros[k] ? null : "1")}>{l}</button>
        ))}
        {hayFiltros && (
          <button type="button" className="fin-chip vacio" style={{ flexShrink: 0 }} onClick={() => { setBusqueda(""); router.replace(`/finanzas/movimientos${mes ? `?mes=${mes}` : "?mes=todo"}`, { scroll: false }); }}>
            Limpiar
          </button>
        )}
      </div>

      {selector === "categoria" && datos && (
        <div className="fin-selector" style={{ marginBottom: 8 }}>
          <GrillaCategorias categorias={datos.categorias} tipo={filtros.tipo ?? "gasto"} onElegir={(id) => { setFiltro("categoria", id); setSelector(null); }} />
        </div>
      )}
      {selector === "medio" && (
        <div className="fin-selector fin-chips" style={{ marginBottom: 8 }}>
          {MEDIOS_PAGO.map((m) => (
            <button key={m} type="button" className="fin-chip" onClick={() => { setFiltro("medio", m); setSelector(null); }}>{MEDIO_LABEL[m]}</button>
          ))}
        </div>
      )}

      {/* Totales de lo que se ve */}
      {visibles.length > 0 && (
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--tx2)", margin: "4px 0 8px", flexWrap: "wrap" }}>
          {totales.gastos.ars ? <span>Gastos <strong style={{ color: "var(--tx)" }}>{fmtArs(totales.gastos.ars)}</strong> <span style={{ color: "var(--tx3)" }}>{fmtUsd(totales.gastos.usd)}</span></span> : null}
          {totales.ingresos.ars ? <span>Ingresos <strong style={{ color: "var(--tx)" }}>{fmtArs(totales.ingresos.ars)}</strong> <span style={{ color: "var(--tx3)" }}>{fmtUsd(totales.ingresos.usd)}</span></span> : null}
        </div>
      )}

      {sinClasificarVisibles > 0 && (
        <Link href="/finanzas/clasificar" className="fin-kpi" style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <span style={{ flex: 1 }}>{sinClasificarVisibles === 1 ? "1 movimiento sin categoría" : `${sinClasificarVisibles} movimientos sin categoría`}</span>
          <span className="fin-link">Clasificar ›</span>
        </Link>
      )}

      {error && !lista && <div className="fin-vacio">No pudimos cargar los movimientos. Revisá la conexión.</div>}
      {!lista && !error && <div style={{ color: "var(--tx3)" }}>Cargando…</div>}

      {lista && visibles.length === 0 && (
        hayFiltros || filtros.q ? (
          <div className="fin-vacio"><strong>Nada con esos filtros</strong>Probá con otro período o tocá Limpiar.</div>
        ) : (
          <div className="fin-vacio">
            <strong>Todavía no hay movimientos{mes ? ` en ${nombreMes(mes)}` : ""}</strong>
            Tocá <b>＋ Cargar</b> y dictá algo como &quot;súper 180 lucas, nafta 40 con la visa&quot;. Todo lo que cargues aparece acá, agrupado por día.
          </div>
        )
      )}

      {porDia.length > 0 && <div style={{ marginTop: 14 }}><MarcaPrimeraVez id="movimientos" /></div>}
      {porDia.map(([dia, ms]) => {
        const gastoDia = sumarMontos(ms.filter((m) => m.tipo === "gasto").map((m) => ({ ars: m.montoArs, usd: m.montoUsd })));
        return (
          <section key={dia} className="fin-seccion" style={{ marginTop: 14 }}>
            <div className="fin-seccion-head">
              <h2 style={{ textTransform: "none", letterSpacing: 0, fontSize: 13 }}>{tituloDia(dia)}</h2>
              {gastoDia.ars ? <span style={{ fontSize: 12, color: "var(--tx3)" }}>{fmtArs(gastoDia.ars)}</span> : null}
            </div>
            <div className="fin-lista">
              {ms.map((m) => (
                <FilaMovimiento key={m.id} m={m} onAbrir={() => setAbierto(m)} onEliminar={() => eliminar(m)} />
              ))}
            </div>
          </section>
        );
      })}
      {lista?.hayMas && <div style={{ color: "var(--tx3)", fontSize: 12, marginTop: 10 }}>Se muestran los últimos 500. Usá los filtros para ver el resto.</div>}

      {abierto && datos && (
        <DetalleMovimiento
          key={abierto.id}
          movimiento={abierto}
          datos={datos}
          onCerrar={cerrarDetalle}
          onActualizado={(m) => setLista((l) => (l ? { ...l, movimientos: l.movimientos.map((x) => (x.id === m.id ? m : x)) } : l))}
          onEliminar={eliminar}
        />
      )}

      {borrando.length > 0 && (
        <div className="fin-toast" role="status">
          {borrando.length === 1 ? "Movimiento eliminado" : `${borrando.length} movimientos eliminados`}
          <button type="button" className="accion" onClick={() => { if (timerBorrado.current) clearTimeout(timerBorrado.current); setBorrando([]); }}>
            Deshacer
          </button>
        </div>
      )}
    </>
  );
}

export default function PaginaMovimientos() {
  return (
    <Suspense fallback={<div style={{ color: "var(--tx3)" }}>Cargando…</div>}>
      <Movimientos />
    </Suspense>
  );
}
