"use client";
// Resumen con IA de un período (spec §9), en tarjetas. Se usa en Estadísticas (a pedido) y en el
// cierre de mes (se genera solo). Si cambian los movimientos del período ofrece "Actualizar resumen".
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccionResumen, ResumenGuardado } from "@/lib/finanzas/resumenIa";

type Estado =
  | { fase: "cargando" }
  | { fase: "vacio"; disponible: boolean }
  | { fase: "generando"; previo: ResumenGuardado | null }
  | { fase: "listo"; resumen: ResumenGuardado }
  | { fase: "error"; mensaje: string; previo: ResumenGuardado | null };

function destino(accion: AccionResumen, categoriaId: string | null, desde: string, hasta: string): { href: string; texto: string } | null {
  const periodo = desde === hasta ? `mes=${hasta}` : `desde=${desde}&hasta=${hasta}`;
  switch (accion) {
    case "revisar_suscripciones":
      return { href: `/finanzas/movimientos?${periodo}&categoria=${categoriaId ?? "fincat_suscripciones"}`, texto: "Revisar suscripciones" };
    case "ver_categoria":
      return categoriaId ? { href: `/finanzas/movimientos?${periodo}&categoria=${categoriaId}`, texto: "Ver esos movimientos" } : null;
    case "ajustar_presupuesto":
      return { href: "/finanzas/presupuesto", texto: "Ir al presupuesto" };
    case "aportar_meta":
      return { href: "/finanzas/metas", texto: "Ir a metas" };
    case "clasificar":
      return { href: "/finanzas/clasificar", texto: "Clasificar gastos" };
    default:
      return null;
  }
}

function Tarjeta({ icono, titulo, children, destacada }: { icono: string; titulo: string; children: React.ReactNode; destacada?: boolean }) {
  return (
    <div className="fin-ia-tarjeta" style={destacada ? { borderColor: "var(--acc)", background: "var(--amb-b)" } : undefined}>
      <div className="fin-kpi-label"><span aria-hidden>{icono}</span> {titulo}</div>
      {children}
    </div>
  );
}

function Lista({ items }: { items: string[] }) {
  return <ul className="fin-ia-lista">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
}

const cuando = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-AR", { day: "numeric", month: "numeric" })} a las ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
};

export default function ResumenIa({ desde, hasta, autoGenerar = false }: { desde: string; hasta: string; autoGenerar?: boolean }) {
  const [e, setE] = useState<Estado>({ fase: "cargando" });
  const pidiendo = useRef(false);

  const generar = useCallback(async (previo: ResumenGuardado | null) => {
    if (pidiendo.current) return;
    pidiendo.current = true;
    setE({ fase: "generando", previo });
    try {
      const r = await fetch("/api/finanzas/resumen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desde, hasta }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.resumen) throw new Error(j.error || "No pude armar el resumen. Probá de nuevo.");
      setE({ fase: "listo", resumen: j.resumen });
    } catch (err) {
      setE({ fase: "error", mensaje: err instanceof Error ? err.message : "No pude armar el resumen.", previo });
    } finally {
      pidiendo.current = false;
    }
  }, [desde, hasta]);

  useEffect(() => {
    let vivo = true;
    setE({ fase: "cargando" });
    fetch(`/api/finanzas/resumen?desde=${desde}&hasta=${hasta}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { resumen: ResumenGuardado | null; disponible: boolean }) => {
        if (!vivo) return;
        if (j.resumen) setE({ fase: "listo", resumen: j.resumen });
        else if (autoGenerar && j.disponible) generar(null);
        else setE({ fase: "vacio", disponible: j.disponible });
      })
      .catch(() => vivo && setE({ fase: "error", mensaje: "No pudimos cargar el resumen. Revisá la conexión.", previo: null }));
    return () => { vivo = false; };
  }, [desde, hasta, autoGenerar, generar]);

  if (e.fase === "cargando") return <div style={{ color: "var(--tx3)" }}>Cargando…</div>;

  if (e.fase === "vacio") {
    return (
      <div className="fin-kpi" style={{ padding: 14, color: "var(--tx2)", lineHeight: 1.45 }}>
        <strong style={{ display: "block", color: "var(--tx)", marginBottom: 4 }}>Un resumen de este período, en criollo</strong>
        Lo principal, desvíos contra el presupuesto, gastos hormiga, suscripciones a revisar y una recomendación concreta.
        {e.disponible ? (
          <div style={{ marginTop: 10 }}><button type="button" className="fin-btn secundario" onClick={() => generar(null)}>✨ Armar resumen</button></div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--tx3)" }}>Falta configurar la clave de Anthropic para generarlo.</div>
        )}
      </div>
    );
  }

  const resumen = e.fase === "listo" ? e.resumen : e.previo;
  const t = resumen?.tarjetas;
  const accion = t ? destino(t.recomendacion.accion, t.recomendacion.categoria_id, desde, hasta) : null;

  return (
    <div style={{ display: "grid", gap: 10 }} aria-busy={e.fase === "generando"}>
      {e.fase === "generando" && (
        <div className="fin-ia-generando" role="status">
          <span className="fin-ia-punto" aria-hidden /> {resumen ? "Actualizando el resumen…" : "Armando el resumen… tarda unos segundos"}
        </div>
      )}
      {e.fase === "error" && (
        <div className="fin-ia-aviso" role="alert">
          <span style={{ flex: 1 }}>{e.mensaje}</span>
          <button type="button" className="fin-link" onClick={() => generar(e.previo)}>Reintentar</button>
        </div>
      )}
      {e.fase === "listo" && resumen?.desactualizado && (
        <div className="fin-ia-aviso">
          <span style={{ flex: 1 }}>Cambiaron movimientos de este período desde que se armó.</span>
          <button type="button" className="fin-link" onClick={() => generar(resumen)}>Actualizar resumen</button>
        </div>
      )}

      {t && (
        <div style={{ display: "grid", gap: 8, opacity: e.fase === "generando" ? 0.5 : 1, transition: "opacity .2s" }}>
          <Tarjeta icono="💡" titulo="Lo principal"><p style={{ margin: 0, lineHeight: 1.5 }}>{t.principal}</p></Tarjeta>
          {t.desvios.length > 0 && <Tarjeta icono="📊" titulo="Desvíos"><Lista items={t.desvios} /></Tarjeta>}
          {t.hormiga.length > 0 && <Tarjeta icono="🐜" titulo="Gastos hormiga"><Lista items={t.hormiga} /></Tarjeta>}
          {t.suscripciones.length > 0 && <Tarjeta icono="🔁" titulo="Suscripciones a revisar"><Lista items={t.suscripciones} /></Tarjeta>}
          {t.metas.length > 0 && <Tarjeta icono="🎯" titulo="Metas"><Lista items={t.metas} /></Tarjeta>}
          {t.recomendacion.texto && (
            <Tarjeta icono="👉" titulo="Una recomendación" destacada>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{t.recomendacion.texto}</p>
              {accion && <Link href={accion.href} className="fin-btn primario" style={{ marginTop: 10 }}>{accion.texto}</Link>}
            </Tarjeta>
          )}
          {resumen && e.fase === "listo" && !resumen.desactualizado && (
            <div style={{ display: "flex", alignItems: "center", fontSize: 11, color: "var(--tx3)" }}>
              <span style={{ flex: 1 }}>Armado con IA el {cuando(resumen.generadoAt)}</span>
              <button type="button" className="fin-link" style={{ fontSize: 12 }} onClick={() => generar(resumen)}>Volver a armar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
