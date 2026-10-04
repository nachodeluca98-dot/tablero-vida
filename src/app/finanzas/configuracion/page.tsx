"use client";
// Configuración del módulo: tarjetas, días de revisión, avisos por Telegram (spec §8) y guías (spec §7).
import { useCallback, useEffect, useState } from "react";

type Tarjeta = { id: string; nombre: string; diaCierre: number; diaVencimiento: number | null; esDefault: boolean };
type Pref = { diasRevision: number[]; mostrarGuias: boolean; ajusteInflacionDefault: number | null };
type AvisoPref = { tipo: string; nombre: string; activo: boolean };

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo guardar");
  return j;
}

function Interruptor({ activo, onCambiar, etiqueta }: { activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambiar(!activo)}
      style={{ width: 52, height: 30, borderRadius: 999, padding: 3, border: "none", background: activo ? "var(--acc)" : "var(--bd)", display: "flex", justifyContent: activo ? "flex-end" : "flex-start", flexShrink: 0 }}
    >
      <span style={{ width: 24, height: 24, borderRadius: 999, background: activo ? "#000" : "var(--tx2)" }} />
    </button>
  );
}

export default function Configuracion() {
  const [tarjetas, setTarjetas] = useState<Tarjeta[] | null>(null);
  const [pref, setPref] = useState<Pref | null>(null);
  const [avisos, setAvisos] = useState<AvisoPref[] | null>(null);
  const [nueva, setNueva] = useState({ nombre: "", diaCierre: "" });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [t, p, a] = await Promise.all([
      fetch("/api/finanzas/tarjetas", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/finanzas/preferencias", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/finanzas/avisos?preferencias=1", { cache: "no-store" }).then((r) => r.json()),
    ]).catch(() => [null, null, null]);
    setTarjetas(t); setPref(p); setAvisos(a);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  async function hacer(fn: () => Promise<unknown>, ok = "Guardado") {
    try { await fn(); setError(null); setAviso(ok); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo"); }
    cargar();
  }

  if (!tarjetas || !pref || !avisos) return <div style={{ color: "var(--tx3)" }}>Cargando…</div>;
  const quincena = pref.diasRevision.find((d) => d > 0) ?? null;

  return (
    <>
      <h1>Configuración</h1>
      {error && <div className="fin-aviso-dup" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      {/* Tarjetas */}
      <section id="tarjetas" className="fin-seccion">
        <div className="fin-seccion-head"><h2>Tarjetas de crédito</h2></div>
        <p style={{ color: "var(--tx3)", fontSize: 13, marginTop: 0 }}>Con el día de cierre, cada compra se imputa al mes en que pagás el resumen.</p>
        <div className="fin-lista">
          {tarjetas.length === 0 && <div className="fin-fila" style={{ color: "var(--tx3)" }}>Todavía no cargaste tarjetas.</div>}
          {tarjetas.map((t) => (
            <div key={t.id} className="fin-fila" style={{ flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 120 }}>
                💳 {t.nombre}
                {t.esDefault && <span className="fin-marca">default</span>}
              </span>
              <label style={{ fontSize: 13, color: "var(--tx2)", display: "flex", alignItems: "center", gap: 4 }}>
                Cierra el
                <input
                  className="fin-input"
                  style={{ width: 60 }}
                  inputMode="numeric"
                  defaultValue={t.diaCierre}
                  aria-label={`Día de cierre de ${t.nombre}`}
                  onBlur={(e) => Number(e.target.value) !== t.diaCierre && hacer(() => api(`/api/finanzas/tarjetas/${t.id}`, "PATCH", { diaCierre: Number(e.target.value) }))}
                />
              </label>
              {!t.esDefault && <button type="button" className="fin-chip" onClick={() => hacer(() => api(`/api/finanzas/tarjetas/${t.id}`, "PATCH", { esDefault: true }), `${t.nombre} es la default`)}>Usar por defecto</button>}
              <button type="button" className="fin-icono-btn" aria-label={`Dar de baja ${t.nombre}`} onClick={() => hacer(() => api(`/api/finanzas/tarjetas/${t.id}`, "PATCH", { activa: false }), `${t.nombre} dada de baja`)}>✕</button>
            </div>
          ))}
        </div>
        <form
          style={{ display: "flex", gap: 8, marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            hacer(() => api("/api/finanzas/tarjetas", "POST", { nombre: nueva.nombre, diaCierre: Number(nueva.diaCierre) }), "Tarjeta agregada").then(() => setNueva({ nombre: "", diaCierre: "" }));
          }}
        >
          <input className="fin-input" style={{ flex: 1 }} value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Visa, Master…" aria-label="Nombre de la tarjeta" />
          <input className="fin-input" style={{ width: 90 }} inputMode="numeric" value={nueva.diaCierre} onChange={(e) => setNueva({ ...nueva, diaCierre: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="Cierre" aria-label="Día de cierre" />
          <button type="submit" className="fin-btn secundario" disabled={!nueva.nombre.trim() || !nueva.diaCierre}>Agregar</button>
        </form>
      </section>

      {/* Revisiones */}
      <section className="fin-seccion">
        <div className="fin-seccion-head"><h2>Revisiones</h2></div>
        <div className="fin-lista">
          <div className="fin-fila">
            <span style={{ flex: 1 }}>Revisión quincenal<span style={{ display: "block", fontSize: 12, color: "var(--tx3)" }}>El cierre de mes es siempre el último día</span></span>
            <select
              className="fin-input"
              style={{ width: 110 }}
              value={quincena ?? ""}
              aria-label="Día de la revisión quincenal"
              onChange={(e) => hacer(() => api("/api/finanzas/preferencias", "PATCH", { diasRevision: e.target.value ? [Number(e.target.value), 0] : [0] }))}
            >
              <option value="">No hacer</option>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Día {d}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Avisos */}
      <section className="fin-seccion">
        <div className="fin-seccion-head"><h2>Avisos por Telegram</h2></div>
        <p style={{ color: "var(--tx3)", fontSize: 13, marginTop: 0 }}>Llegan a la mañana, como mucho 2 por día, cada uno con un botón que abre la app donde corresponde.</p>
        <div className="fin-lista">
          {avisos.map((a) => (
            <div key={a.tipo} className="fin-fila">
              <span style={{ flex: 1 }}>{a.nombre}</span>
              <Interruptor activo={a.activo} etiqueta={a.nombre} onCambiar={(v) => hacer(() => api("/api/finanzas/avisos", "PATCH", { tipo: a.tipo, activo: v }), v ? "Aviso activado" : "Aviso apagado")} />
            </div>
          ))}
        </div>
      </section>

      {/* Guías */}
      <section className="fin-seccion">
        <div className="fin-seccion-head"><h2>Ayuda</h2></div>
        <div className="fin-lista">
          <div className="fin-fila">
            <span style={{ flex: 1 }}>Mostrar guías y consejos<span style={{ display: "block", fontSize: 12, color: "var(--tx3)" }}>Siempre podés releerlas en Más → Guías</span></span>
            <Interruptor activo={pref.mostrarGuias} etiqueta="Mostrar guías" onCambiar={(v) => hacer(() => api("/api/finanzas/preferencias", "PATCH", { mostrarGuias: v }))} />
          </div>
        </div>
      </section>

      {aviso && <div className="fin-toast" role="status">✓ {aviso}</div>}
    </>
  );
}
