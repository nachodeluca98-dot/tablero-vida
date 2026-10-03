"use client";
// Tarjeta editable de un movimiento antes de guardar (spec §6.2): todo se edita en el lugar,
// tocando un chip se abre un selector compacto debajo (no una pantalla nueva).
import { useState } from "react";
import type { Borrador, MedioPago, TipoMov } from "@/lib/finanzas/borrador";
import { MEDIOS_PAGO, MEDIO_LABEL } from "@/lib/finanzas/borrador";
import { equivalentes, fmtArs, fmtUsd } from "@/lib/finanzas/dinero";
import { anioMesDe, hoyISO, mesImputacion, nombreMes, sumarMeses } from "@/lib/finanzas/fechas";
import type { DatosCarga } from "@/lib/finanzas/carga";
import GrillaCategorias from "./GrillaCategorias";
import { formatearTexto, montoDeTexto, textoDeMonto } from "./Teclado";

type Selector = null | "categoria" | "medio" | "mes" | "fecha" | "cuotas" | "tipo" | "meta" | "incluye" | "compartido";

const TIPO_LABEL: Record<TipoMov, string> = { gasto: "Gasto", ingreso: "Ingreso", ahorro: "Ahorro" };
const CUOTAS = [1, 3, 6, 9, 12, 18, 24];

const fechaLinda = (iso: string) => {
  const hoy = hoyISO();
  if (iso === hoy) return "Hoy";
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  if (iso === ayer) return "Ayer";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
};

// Recalcula el mes de imputación salvo que el usuario lo haya elegido a mano
export function conImputacion(b: Borrador, tarjetas: DatosCarga["tarjetas"]): Borrador {
  if (b.mesImputacionManual) return b;
  const t = b.medioPago === "tarjeta_credito" ? tarjetas.find((x) => x.id === b.tarjetaId) ?? tarjetas[0] : undefined;
  return { ...b, mesImputacion: mesImputacion(b.fecha, b.medioPago, t?.diaCierre) };
}

export default function TarjetaBorrador({
  b, datos, onChange, onQuitar, ocultarMonto, ocultarCategoria, ocultarCuotas, mostrarMesSiempre,
}: {
  b: Borrador;
  datos: DatosCarga;
  onChange: (b: Borrador) => void;
  onQuitar?: () => void;
  ocultarMonto?: boolean;
  ocultarCategoria?: boolean;
  ocultarCuotas?: boolean; // en un movimiento ya guardado el plan de cuotas no se edita desde acá
  mostrarMesSiempre?: boolean;
}) {
  const [abierto, setAbierto] = useState<Selector>(null);
  const [editMonto, setEditMonto] = useState(false);
  const cat = datos.categorias.find((c) => c.id === b.categoriaId);
  const tarjeta = datos.tarjetas.find((t) => t.id === b.tarjetaId);
  const meta = datos.metas.find((m) => m.id === b.metaId);
  const eq = b.monto != null ? equivalentes(b.monto, b.moneda, datos.tipoCambio) : null;

  const set = (cambios: Partial<Borrador>) => onChange(conImputacion({ ...b, ...cambios }, datos.tarjetas));
  const toggle = (s: Selector) => setAbierto((a) => (a === s ? null : s));

  const mesFecha = anioMesDe(b.fecha);
  const cuotaTexto =
    b.cuotasTotal && b.cuotasTotal > 1 && b.monto
      ? `${b.cuotasTotal} cuotas de ${b.moneda === "USD" ? fmtUsd(b.monto / b.cuotasTotal) : fmtArs(b.monto / b.cuotasTotal)}, hasta ${nombreMes(sumarMeses(b.mesImputacion, b.cuotasTotal - 1))}`
      : null;

  return (
    <article className="fin-borrador" aria-label={b.descripcion || "Movimiento"}>
      {/* Monto + moneda + quitar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!ocultarMonto && (
          editMonto ? (
            <input
              className="inline"
              autoFocus
              inputMode="decimal"
              defaultValue={textoDeMonto(b.monto)}
              aria-label="Monto"
              style={{ fontSize: 22, fontWeight: 700, maxWidth: 180 }}
              onBlur={(e) => { set({ monto: montoDeTexto(e.target.value.replace(/\./g, "")) }); setEditMonto(false); }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <button type="button" className="fin-borrador-monto" onClick={() => setEditMonto(true)} aria-label="Editar monto">
              {b.monto != null ? `${b.moneda === "USD" ? "US$" : "$"} ${formatearTexto(textoDeMonto(b.monto))}` : <span style={{ color: "var(--amb-t)" }}>Falta el monto</span>}
            </button>
          )
        )}
        {!ocultarMonto && (
          <button type="button" className="fin-chip activo" onClick={() => set({ moneda: b.moneda === "ARS" ? "USD" : "ARS" })} aria-label={`Moneda ${b.moneda}, tocar para cambiar`}>
            {b.moneda}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {!ocultarMonto && eq && (
          <span style={{ color: "var(--tx3)", fontSize: 12 }}>{b.moneda === "ARS" ? fmtUsd(eq.usd) : fmtArs(eq.ars)}</span>
        )}
        {onQuitar && (
          <button type="button" className="fin-icono-btn" onClick={onQuitar} aria-label="Quitar">🗑</button>
        )}
      </div>

      <input
        className="inline"
        type="text"
        value={b.descripcion ?? ""}
        placeholder="Descripción (opcional)"
        aria-label="Descripción"
        onChange={(e) => set({ descripcion: e.target.value || null })}
      />

      {cuotaTexto && <div style={{ fontSize: 13, color: "var(--tx2)", marginTop: 6 }}>💳 {cuotaTexto}</div>}

      {/* Chips */}
      <div className="fin-chips" style={{ marginTop: 10 }}>
        {b.tipo !== "gasto" && (
          <button type="button" className={`fin-chip ${abierto === "tipo" ? "activo" : ""}`} onClick={() => toggle("tipo")}>{TIPO_LABEL[b.tipo]}</button>
        )}
        {!ocultarCategoria && (
          <button type="button" className={`fin-chip ${cat ? "" : "vacio"} ${abierto === "categoria" ? "activo" : ""}`} onClick={() => toggle("categoria")}>
            {cat ? <>{cat.icono} {cat.nombre}</> : "Sin categoría"}
          </button>
        )}
        {b.tipo === "ahorro" && (
          <button type="button" className={`fin-chip ${meta ? "" : "vacio"} ${abierto === "meta" ? "activo" : ""}`} onClick={() => toggle("meta")}>
            {meta ? <>{meta.icono || "🎯"} {meta.nombre}</> : "Sin meta"}
          </button>
        )}
        <button type="button" className={`fin-chip ${b.medioPago ? "" : "vacio"} ${abierto === "medio" ? "activo" : ""}`} onClick={() => toggle("medio")}>
          {b.medioPago ? (b.medioPago === "tarjeta_credito" && tarjeta ? `💳 ${tarjeta.nombre}` : MEDIO_LABEL[b.medioPago]) : "Medio de pago"}
        </button>
        <button type="button" className={`fin-chip ${abierto === "fecha" ? "activo" : ""}`} onClick={() => toggle("fecha")}>📅 {fechaLinda(b.fecha)}</button>
        {(mostrarMesSiempre || b.mesImputacion !== mesFecha || b.mesImputacionManual) && (
          <button type="button" className={`fin-chip ${b.mesImputacion !== mesFecha ? "activo" : ""}`} onClick={() => toggle("mes")}>
            {b.mesImputacion !== mesFecha ? "Se paga en" : "Mes:"} {nombreMes(b.mesImputacion)}
          </button>
        )}
        {b.medioPago === "tarjeta_credito" && !ocultarCuotas && (
          <button type="button" className={`fin-chip ${abierto === "cuotas" ? "activo" : ""}`} onClick={() => toggle("cuotas")}>
            {b.cuotasTotal && b.cuotasTotal > 1 ? `${b.cuotasTotal} cuotas` : "1 pago"}
          </button>
        )}
        <button type="button" className={`fin-chip ${b.esAproximado ? "activo" : ""}`} aria-pressed={b.esAproximado} onClick={() => set({ esAproximado: !b.esAproximado })}>≈ Aprox.</button>
        <button type="button" className={`fin-chip ${b.compartido ? "activo" : ""}`} aria-pressed={b.compartido} onClick={() => { set({ compartido: !b.compartido }); setAbierto(b.compartido ? null : "compartido"); }}>👥 Compartido</button>
        <button type="button" className={`fin-chip ${b.incluye ? "activo" : ""}`} onClick={() => toggle("incluye")}>{b.incluye ? `Incluye: ${b.incluye}` : "+ Incluye"}</button>
        {b.tipo === "gasto" && (
          <button type="button" className="fin-chip" onClick={() => toggle("tipo")} aria-label="Cambiar tipo">Gasto ▾</button>
        )}
      </div>

      {/* Selectores en el lugar */}
      {abierto === "categoria" && (
        <div className="fin-selector">
          <GrillaCategorias categorias={datos.categorias} tipo={b.tipo} sugerida={b.categoriaId} onElegir={(id) => { set({ categoriaId: id }); setAbierto(null); }} />
        </div>
      )}
      {abierto === "tipo" && (
        <div className="fin-selector fin-chips">
          {(["gasto", "ingreso", "ahorro"] as TipoMov[]).map((t) => (
            <button key={t} type="button" className={`fin-chip ${b.tipo === t ? "activo" : ""}`} onClick={() => { set({ tipo: t, categoriaId: null }); setAbierto(null); }}>{TIPO_LABEL[t]}</button>
          ))}
        </div>
      )}
      {abierto === "meta" && (
        <div className="fin-selector fin-chips">
          {datos.metas.length === 0 && <span style={{ color: "var(--tx3)" }}>Todavía no tenés metas.</span>}
          {datos.metas.map((m) => (
            <button key={m.id} type="button" className={`fin-chip ${b.metaId === m.id ? "activo" : ""}`} onClick={() => { set({ metaId: m.id }); setAbierto(null); }}>{m.icono || "🎯"} {m.nombre}</button>
          ))}
        </div>
      )}
      {abierto === "medio" && (
        <div className="fin-selector fin-chips">
          {MEDIOS_PAGO.filter((m) => m !== "tarjeta_credito").map((m) => (
            <button key={m} type="button" className={`fin-chip ${b.medioPago === m ? "activo" : ""}`} onClick={() => { set({ medioPago: m as MedioPago, tarjetaId: null, cuotasTotal: null }); setAbierto(null); }}>{MEDIO_LABEL[m]}</button>
          ))}
          {datos.tarjetas.length === 0 ? (
            <button type="button" className={`fin-chip ${b.medioPago === "tarjeta_credito" ? "activo" : ""}`} onClick={() => { set({ medioPago: "tarjeta_credito" }); setAbierto(null); }}>💳 Tarjeta</button>
          ) : (
            datos.tarjetas.map((t) => (
              <button key={t.id} type="button" className={`fin-chip ${b.tarjetaId === t.id ? "activo" : ""}`} onClick={() => { set({ medioPago: "tarjeta_credito", tarjetaId: t.id }); setAbierto(null); }}>💳 {t.nombre}</button>
            ))
          )}
        </div>
      )}
      {abierto === "fecha" && (
        <div className="fin-selector">
          <input type="date" className="fin-input" value={b.fecha} max={hoyISO()} onChange={(e) => e.target.value && set({ fecha: e.target.value })} aria-label="Fecha" />
        </div>
      )}
      {abierto === "mes" && (
        <div className="fin-selector fin-chips">
          {[-1, 0, 1, 2].map((n) => {
            const am = sumarMeses(mesFecha, n);
            return (
              <button key={am} type="button" className={`fin-chip ${b.mesImputacion === am ? "activo" : ""}`} onClick={() => { onChange({ ...b, mesImputacion: am, mesImputacionManual: true }); setAbierto(null); }}>
                {nombreMes(am)}
              </button>
            );
          })}
        </div>
      )}
      {abierto === "cuotas" && (
        <div className="fin-selector fin-chips">
          {CUOTAS.map((n) => (
            <button key={n} type="button" className={`fin-chip ${(b.cuotasTotal || 1) === n ? "activo" : ""}`} onClick={() => { set({ cuotasTotal: n > 1 ? n : null }); setAbierto(null); }}>
              {n === 1 ? "1 pago" : `${n} cuotas`}
            </button>
          ))}
        </div>
      )}
      {abierto === "incluye" && (
        <div className="fin-selector">
          <input className="fin-input" autoFocus type="text" value={b.incluye ?? ""} placeholder="Ej.: Coto + verdulería + piedras de los gatos" onChange={(e) => set({ incluye: e.target.value || null })} aria-label="Qué incluye" />
        </div>
      )}
      {abierto === "compartido" && b.compartido && (
        <div className="fin-selector">
          <input className="fin-input" autoFocus type="text" value={b.notaCompartido ?? ""} placeholder="Aclaración (opcional): la mitad era de Juli" onChange={(e) => set({ notaCompartido: e.target.value || null })} aria-label="Nota de compartido" />
        </div>
      )}

      {b.duplicado && (
        <div className="fin-aviso-dup" role="status">
          ¿Posible duplicado? {b.duplicado}.
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="fin-btn secundario" onClick={() => onChange({ ...b, duplicado: null })}>Es otro</button>
            {onQuitar && <button type="button" className="fin-btn secundario" onClick={onQuitar}>Ya estaba</button>}
          </div>
        </div>
      )}
    </article>
  );
}
