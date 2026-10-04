"use client";
// Clasificar pendientes (spec §6.5): de a un movimiento, la categoría sugerida primero.
// Tocar una categoría la asigna y pasa al siguiente. "Saltear" y "Listo" siempre visibles.
import Link from "next/link";
import { useEffect, useState } from "react";
import GrillaCategorias from "@/components/finanzas/GrillaCategorias";
import type { DatosCarga } from "@/lib/finanzas/carga";
import { fmtArs, fmtUsd } from "@/lib/finanzas/dinero";
import type { Movimiento } from "@/lib/finanzas/movimientos";

type Pendiente = Movimiento & { sugerida: string | null };

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default function Clasificar() {
  const [datos, setDatos] = useState<DatosCarga | null>(null);
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);
  const [i, setI] = useState(0);
  const [hechos, setHechos] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/finanzas/carga", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/finanzas/clasificar", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([d, p]) => { setDatos(d); setPendientes(p); })
      .catch(() => setError("No pudimos cargar. Revisá la conexión."));
  }, []);

  if (error) return <div className="fin-vacio">{error}</div>;
  if (!datos || !pendientes) return <div style={{ color: "var(--tx3)" }}>Cargando…</div>;

  const total = pendientes.length;
  const actual = pendientes[i];

  // Asignación optimista: avanza al instante y guarda en segundo plano
  function asignar(categoriaId: string) {
    if (!actual) return;
    try { navigator.vibrate?.(12); } catch {}
    const id = actual.id;
    setHechos((h) => h + 1);
    setI((x) => x + 1);
    fetch(`/api/finanzas/movimientos/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoriaId }), keepalive: true,
    }).then((r) => {
      if (!r.ok) throw new Error();
    }).catch(() => {
      setError("Uno no se pudo guardar. Revisá la conexión y volvé a intentar.");
    });
  }

  // Terminado (o no había nada)
  if (!actual) {
    return (
      <div className="fin-celebrar" style={{ textAlign: "center", paddingTop: 32 }}>
        <div style={{ fontSize: 52 }} aria-hidden>{hechos ? "🙌" : "✨"}</div>
        <h1 style={{ marginTop: 8 }}>{hechos ? "¡Todo clasificado!" : "No hay nada para clasificar"}</h1>
        <p style={{ color: "var(--tx2)" }}>
          {hechos ? `Clasificaste ${hechos} ${hechos === 1 ? "movimiento" : "movimientos"}.` : "Todo lo que cargaste tiene su categoría."}
          {hechos < total && ` Quedaron ${total - hechos} salteados.`}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <Link href="/finanzas" className="fin-btn primario">Ir a Inicio</Link>
          {hechos < total && <button type="button" className="fin-btn secundario" onClick={() => location.reload()}>Ver salteados</button>}
        </div>
      </div>
    );
  }

  const cat = actual.sugerida ? datos.categorias.find((c) => c.id === actual.sugerida) : null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Clasificar</h1>
        <span style={{ color: "var(--tx3)" }} aria-live="polite">{i + 1} de {total}</span>
      </div>
      <div className="fin-barra" style={{ marginTop: 10 }} role="progressbar" aria-valuenow={i} aria-valuemax={total} aria-label="Progreso">
        <div className="fin-barra-relleno" style={{ width: `${(i / total) * 100}%` }} />
      </div>

      <div key={actual.id} className="fin-celebrar" style={{ textAlign: "center", padding: "22px 0 14px" }}>
        <div style={{ fontSize: 36, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {actual.moneda === "USD" ? fmtUsd(actual.monto) : fmtArs(actual.monto)}
        </div>
        <div style={{ fontSize: 18, marginTop: 4 }}>{actual.descripcion || "Sin descripción"}</div>
        <div style={{ color: "var(--tx3)", fontSize: 13, marginTop: 4 }}>
          {fechaCorta(actual.fecha)}
          {actual.incluye && ` · ${actual.incluye}`}
          {actual.tipo !== "gasto" && ` · ${actual.tipo === "ingreso" ? "Ingreso" : "Ahorro"}`}
        </div>
        {cat && <div style={{ fontSize: 12, color: "var(--amb-t)", marginTop: 8 }}>Sugerida: {cat.icono} {cat.nombre}</div>}
      </div>

      <GrillaCategorias categorias={datos.categorias} tipo={actual.tipo} sugerida={actual.sugerida} onElegir={asignar} />

      <div className="fin-barra-accion">
        <button type="button" className="fin-btn secundario" onClick={() => setI(i + 1)}>Saltear</button>
        <Link href="/finanzas" className="fin-btn secundario">Listo</Link>
      </div>
    </>
  );
}
