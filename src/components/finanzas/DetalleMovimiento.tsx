"use client";
// Detalle de un movimiento en hoja inferior (spec §6.6): todo editable en el lugar, se guarda solo.
import { useEffect, useRef, useState } from "react";
import type { Borrador } from "@/lib/finanzas/borrador";
import type { DatosCarga } from "@/lib/finanzas/carga";
import { fmtArs, fmtUsd } from "@/lib/finanzas/dinero";
import type { Movimiento } from "@/lib/finanzas/movimientos";
import TarjetaBorrador from "./TarjetaBorrador";
import { montoDeTexto, textoDeMonto } from "./Teclado";

const ORIGEN: Record<string, string> = {
  app_voz: "Dictado", app_rapida: "Carga rápida", app_formulario: "Escrito", revision: "Revisión", cuotas: "Cuotas", modulo_vehiculos: "Vehículos",
};

export function aBorrador(m: Movimiento): Borrador {
  return {
    key: m.id, tipo: m.tipo, descripcion: m.descripcion, incluye: m.incluye, monto: m.monto, moneda: m.moneda,
    esAproximado: m.esAproximado, categoriaId: m.categoriaId, presupuestoItemId: null, medioPago: m.medioPago,
    tarjetaId: m.tarjetaId, cuotasTotal: null, compartido: m.compartido, notaCompartido: m.notaCompartido,
    metaId: m.metaId, fecha: m.fecha, mesImputacion: m.anioMes, mesImputacionManual: true,
  };
}

// Qué cambió entre dos borradores, en el formato del PATCH
function diferencias(a: Borrador, b: Borrador): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  const campos: [keyof Borrador, string][] = [
    ["tipo", "tipo"], ["descripcion", "descripcion"], ["incluye", "incluye"], ["monto", "monto"], ["moneda", "moneda"],
    ["esAproximado", "esAproximado"], ["categoriaId", "categoriaId"], ["medioPago", "medioPago"], ["tarjetaId", "tarjetaId"],
    ["compartido", "compartido"], ["notaCompartido", "notaCompartido"], ["metaId", "metaId"], ["fecha", "fecha"], ["mesImputacion", "anioMes"],
  ];
  for (const [k, api] of campos) if (a[k] !== b[k]) c[api] = b[k];
  return c;
}

export default function DetalleMovimiento({
  movimiento, datos, onCerrar, onActualizado, onEliminar,
}: {
  movimiento: Movimiento;
  datos: DatosCarga;
  onCerrar: () => void;
  onActualizado: (m: Movimiento) => void;
  onEliminar: (m: Movimiento) => void;
}) {
  const [b, setB] = useState<Borrador>(() => aBorrador(movimiento));
  const [tc, setTc] = useState(textoDeMonto(movimiento.tcPropio));
  const [estado, setEstado] = useState<"" | "guardando" | "guardado" | "error">("");
  const [error, setError] = useState<string | null>(null);
  const guardado = useRef<Borrador>(aBorrador(movimiento));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef<Record<string, unknown>>({});

  async function enviar() {
    const cambios = pendiente.current;
    pendiente.current = {};
    if (!Object.keys(cambios).length) return;
    setEstado("guardando");
    const res = await fetch(`/api/finanzas/movimientos/${movimiento.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
      keepalive: true,
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setEstado("error");
      setError(j.error || "No se pudo guardar. Revisá la conexión.");
      return;
    }
    setEstado("guardado");
    setError(null);
    guardado.current = aBorrador(j);
    onActualizado(j);
  }

  // Carga optimista: la pantalla cambia al instante y se guarda en segundo plano (texto: con una pausa)
  function cambiar(nb: Borrador) {
    const dif = diferencias(guardado.current, nb);
    setB(nb);
    pendiente.current = dif; // todo lo que difiere de lo último guardado
    if (timer.current) clearTimeout(timer.current);
    const soloTexto = Object.keys(dif).every((k) => ["descripcion", "incluye", "notaCompartido"].includes(k));
    timer.current = setTimeout(enviar, soloTexto ? 700 : 0);
  }

  function guardarTc() {
    const n = montoDeTexto(tc.replace(/\./g, ""));
    if ((n ?? null) === (movimiento.tcPropio ?? null)) return;
    pendiente.current = { ...pendiente.current, tcPropio: n };
    enviar();
  }

  // Al cerrar, lo que falte se manda igual
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (Object.keys(pendiente.current).length) {
      fetch(`/api/finanzas/movimientos/${movimiento.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pendiente.current), keepalive: true,
      }).catch(() => {});
    }
  }, [movimiento.id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  return (
    <>
      <div className="fin-hoja-fondo" onClick={onCerrar} />
      <div className="fin-hoja" role="dialog" aria-modal="true" aria-label="Detalle del movimiento" style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <div className="fin-hoja-asa" />
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--tx3)", flex: 1 }} aria-live="polite">
            {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "✓ Guardado" : estado === "error" ? "" : "Tocá cualquier dato para cambiarlo"}
          </span>
          <button type="button" className="fin-link" onClick={onCerrar}>Listo</button>
        </div>
        {error && <div className="fin-aviso-dup" role="alert" style={{ marginBottom: 8 }}>{error}</div>}

        <TarjetaBorrador b={b} datos={datos} onChange={cambiar} ocultarCuotas mostrarMesSiempre />

        <div className="fin-lista" style={{ marginTop: 10 }}>
          {movimiento.cuotaNumero != null && (
            <div className="fin-fila"><span style={{ flex: 1 }}>Cuota</span><span>{movimiento.cuotaNumero} de {movimiento.cuotasTotal ?? "?"}</span></div>
          )}
          <div className="fin-fila" style={{ flexWrap: "wrap" }}>
            <span style={{ flex: 1 }}>Tipo de cambio propio</span>
            <input
              className="inline"
              inputMode="decimal"
              value={tc}
              onChange={(e) => setTc(e.target.value)}
              onBlur={guardarTc}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="El del mes"
              aria-label="Tipo de cambio propio"
              style={{ maxWidth: 120, textAlign: "right", background: "transparent", border: "none", borderBottom: "1px dashed var(--bd)", borderRadius: 0 }}
            />
            <div style={{ width: "100%", fontSize: 12, color: "var(--tx3)" }}>
              Si convertiste a un valor concreto. Equivale a {movimiento.moneda === "ARS" ? fmtUsd(movimiento.montoUsd) : fmtArs(movimiento.montoArs)}.
            </div>
          </div>
          <div className="fin-fila"><span style={{ flex: 1 }}>Cargado por</span><span style={{ color: "var(--tx2)" }}>{ORIGEN[movimiento.origen] ?? movimiento.origen}</span></div>
          {movimiento.transcripcion && (
            <div className="fin-fila" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              <span>Lo que dictaste</span>
              <span style={{ color: "var(--tx3)", fontSize: 13 }}>&quot;{movimiento.transcripcion}&quot;</span>
            </div>
          )}
        </div>

        <button type="button" className="fin-btn secundario" style={{ width: "100%", marginTop: 12 }} onClick={() => onEliminar(movimiento)}>
          🗑 Eliminar
        </button>
      </div>
    </>
  );
}
