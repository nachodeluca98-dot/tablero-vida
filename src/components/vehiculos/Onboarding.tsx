"use client";
import { useEffect, useState } from "react";
import { Campo, Sheet, Tip, api, guardarLocal, leerLocal } from "./comun";

export function Bienvenida({ onEmpezar }: { onEmpezar: () => void }) {
  const pasos = [
    { e: "🚗", t: "Agregá tu auto", d: "Alias y km. 30 segundos." },
    { e: "📋", t: "Contame cómo está hoy", d: "Último service, aceite, VTV y seguro." },
    { e: "🎙", t: "Cargá hablando", d: "\"35 litros, 45 lucas, 87.400 km\". Yo hago el resto." },
  ];
  return (
    <div className="card" style={{ padding: 24, textAlign: "center", maxWidth: 520, margin: "20px auto" }}>
      <div style={{ fontSize: 40 }}>🚗</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "8px 0 4px" }}>Tu auto, sin planillas</h2>
      <div style={{ color: "var(--tx2)", marginBottom: 20 }}>
        Te aviso antes de que venza algo y sabés cuánto gastás y cuánto rinde, sin cargar datos uno por uno.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left", marginBottom: 22 }}>
        {pasos.map((p, i) => (
          <div key={p.t} style={{ display: "flex", gap: 12, alignItems: "center", background: "var(--bg3)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 22 }}>{p.e}</div>
            <div>
              <div style={{ fontWeight: 600 }}>{i + 1}. {p.t}</div>
              <div style={{ fontSize: 12, color: "var(--tx3)" }}>{p.d}</div>
            </div>
          </div>
        ))}
      </div>
      <button className="primary" onClick={onEmpezar} style={{ width: "100%", padding: 14, fontSize: 15 }}>Agregar mi auto</button>
    </div>
  );
}

const FILAS = [
  { tipo: "aceite", label: "🛢️ Último cambio de aceite", conKm: true },
  { tipo: "service", label: "🔧 Último service", conKm: true },
  { tipo: "vtv", label: "📋 Última VTV", conKm: false, conVence: true },
  { tipo: "correa", label: "⚙️ Último cambio de correa de distribución", conKm: true },
  { tipo: "neumaticos", label: "🛞 Última rotación de neumáticos", conKm: true },
];

// Formulario de estado inicial: muestra solo lo que todavía no tiene registro
export function EstadoInicialForm({ vehiculo, sinDatos, onGuardado, onSaltear, textoSaltear = "Ahora no" }: {
  vehiculo: any; sinDatos: Set<string> | null; onGuardado: () => void; onSaltear: () => void; textoSaltear?: string;
}) {
  const [f, setF] = useState<any>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const filas = FILAS.filter(r => !sinDatos || sinDatos.has(r.tipo));
  const faltaSeguro = vehiculo.seguroMensual == null;
  const faltaKm = vehiculo.kmActual == null;
  const set = (k: string, campo: string, val: string) => setF((p: any) => ({ ...p, [k]: { ...p[k], [campo]: val } }));

  async function guardar() {
    setGuardando(true); setError("");
    try {
      await api(`/api/vehiculos/${vehiculo.id}/inicial`, "POST", { ...f, kmActual: f.km?.valor });
      onGuardado();
    } catch (e: any) { setError(e.message); } finally { setGuardando(false); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 14 }}>
        Con esto calculo cuándo te toca cada cosa. <b>Completá lo que sepas</b>; si no te acordás la fecha exacta, poné una aproximada.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {faltaKm && (
          <Campo label="📍 Km actuales del auto">
            <input type="number" inputMode="numeric" value={f.km?.valor ?? ""} onChange={e => set("km", "valor", e.target.value)} />
          </Campo>
        )}
        {filas.map(r => (
          <div key={r.tipo}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{r.label}</div>
            <div className="vh-2">
              <Campo label="Fecha"><input type="date" value={f[r.tipo]?.fecha ?? ""} onChange={e => set(r.tipo, "fecha", e.target.value)} /></Campo>
              {r.conKm && <Campo label="Km"><input type="number" inputMode="numeric" value={f[r.tipo]?.km ?? ""} onChange={e => set(r.tipo, "km", e.target.value)} /></Campo>}
              {r.conVence && <Campo label="Vence (oblea)"><input type="date" value={f[r.tipo]?.vence ?? ""} onChange={e => set(r.tipo, "vence", e.target.value)} /></Campo>}
            </div>
          </div>
        ))}
        {faltaSeguro && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>🛡️ Seguro</div>
            <div className="vh-2">
              <Campo label="Cuota mensual $"><input type="number" inputMode="numeric" value={f.seguro?.monto ?? ""} onChange={e => set("seguro", "monto", e.target.value)} /></Campo>
              <Campo label="Compañía"><input type="text" value={f.seguro?.compania ?? ""} onChange={e => set("seguro", "compania", e.target.value)} /></Campo>
            </div>
            <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Se registra solo cada mes. Si cambia, lo actualizás en un toque.</div>
          </div>
        )}
      </div>
      {error && <div style={{ color: "var(--red-t)", fontSize: 12, marginTop: 10 }}>{error}</div>}
      <button className="primary" disabled={guardando} onClick={guardar} style={{ width: "100%", marginTop: 16, padding: 12 }}>
        {guardando ? "Guardando..." : "Guardar"}
      </button>
      <button onClick={onSaltear} style={{ width: "100%", marginTop: 8, border: "none", background: "none", color: "var(--tx3)" }}>{textoSaltear}</button>
    </div>
  );
}

export function AltaVehiculo({ abierto, onCerrar, onCreado, onEstadoGuardado, onPrimeraCarga }: {
  abierto: boolean; onCerrar: () => void; onCreado: (id: string) => void; onEstadoGuardado: () => void; onPrimeraCarga: () => void;
}) {
  const [paso, setPaso] = useState<"datos" | "estado" | "listo">("datos");
  const [f, setF] = useState<any>({});
  const [mas, setMas] = useState(false);
  const [creado, setCreado] = useState<any>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) { setPaso("datos"); setF({}); setMas(false); setCreado(null); setError(""); }
  }, [abierto]);

  async function crear() {
    setGuardando(true); setError("");
    try {
      const v = await api("/api/vehiculos", "POST", f);
      setCreado(v);
      onCreado(v.id);
      setPaso("estado");
    } catch (e: any) { setError(e.message); } finally { setGuardando(false); }
  }

  const titulo = paso === "datos" ? "Nuevo vehículo" : paso === "estado" ? `¿Cómo está ${creado?.alias} hoy?` : "¡Listo!";
  const input = (k: string, label: string, type = "text", placeholder = "") => (
    <Campo label={label}>
      <input type={type} inputMode={type === "number" ? "numeric" : undefined} value={f[k] ?? ""} placeholder={placeholder}
        onChange={e => setF({ ...f, [k]: e.target.value })} />
    </Campo>
  );

  return (
    <Sheet abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }} aria-hidden>
        {["datos", "estado", "listo"].map((p, i) => (
          <div key={p} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= ["datos", "estado", "listo"].indexOf(paso) ? "var(--acc)" : "var(--bd)" }} />
        ))}
      </div>

      {paso === "datos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Campo label="¿Cómo le decís?">
            <input type="text" autoFocus value={f.alias ?? ""} placeholder="el Gol, la camioneta..." onChange={e => setF({ ...f, alias: e.target.value })} />
          </Campo>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: -6 }}>Es el nombre que vas a usar al hablar: &quot;cargué el Gol&quot;.</div>
          {input("kmActual", "Km actuales (los ves en el tablero)", "number")}
          {!mas ? (
            <button onClick={() => setMas(true)} style={{ border: "none", background: "none", color: "var(--tx2)", padding: 0, textAlign: "left", textDecoration: "underline" }}>
              + Marca, modelo y patente (opcional)
            </button>
          ) : (
            <div className="vh-2">
              {input("marca", "Marca", "text", "Volkswagen")}
              {input("modelo", "Modelo", "text", "Gol Trend")}
              {input("anio", "Año", "number")}
              {input("patente", "Patente")}
            </div>
          )}
          {error && <div style={{ color: "var(--red-t)", fontSize: 12 }}>{error}</div>}
          <button className="primary" disabled={guardando || !f.alias?.trim()} onClick={crear} style={{ padding: 12, fontSize: 15 }}>
            {guardando ? "Creando..." : "Siguiente"}
          </button>
        </div>
      )}

      {paso === "estado" && creado && (
        <EstadoInicialForm vehiculo={creado} sinDatos={null} onGuardado={() => { onEstadoGuardado(); setPaso("listo"); }} onSaltear={() => setPaso("listo")} textoSaltear="Lo completo después" />
      )}

      {paso === "listo" && (
        <div>
          <div style={{ textAlign: "center", fontSize: 40, marginBottom: 4 }}>🎉</div>
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{creado?.alias} ya está en tu tablero</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {[
              ["➕", "Cada vez que cargues nafta o lo lleves al taller, tocá el botón Cargar y contalo con tu voz."],
              ["🚨", "Arriba vas a ver los pendientes ordenados por urgencia."],
              ["📲", "El bot de Telegram te avisa a la mañana si algo está por vencer."],
            ].map(([e, t]) => (
              <div key={t} style={{ display: "flex", gap: 10, fontSize: 13 }}><span>{e}</span><span>{t}</span></div>
            ))}
          </div>
          <Tip>Para ver el rendimiento real, cargá con tanque lleno y decí los km. Con 2 cargas ya lo tenés.</Tip>
          <button className="primary" onClick={onPrimeraCarga} style={{ width: "100%", marginTop: 16, padding: 12, fontSize: 15 }}>⛽ Hacer mi primera carga</button>
          <button onClick={onCerrar} style={{ width: "100%", marginTop: 8, border: "none", background: "none", color: "var(--tx2)" }}>Ir a mi tablero</button>
        </div>
      )}
    </Sheet>
  );
}

const ESTADO_CORE = ["aceite", "service", "vtv"];

export function PrimerosPasos({ det, onEstado, onCarga }: { det: any; onEstado: () => void; onCarga: () => void }) {
  const v = det.vehiculo;
  const clave = `vh-pasos-oculto-${v.id}`;
  const claveBot = "vh-paso-bot";
  const [oculto, setOculto] = useState(true);
  const [bot, setBot] = useState(false);
  useEffect(() => {
    setOculto(leerLocal(clave) === "1");
    setBot(leerLocal(claveBot) === "1");
  }, [clave]);

  const sinDatos = new Set(det.vencimientos.filter((x: any) => x.estado === "sin_datos").map((x: any) => x.tipo));
  const pasos = [
    { ok: true, t: "Agregaste tu auto" },
    { ok: ESTADO_CORE.every(t => !sinDatos.has(t)) || v.mantenimientos.some((m: any) => m.fuente === "inicial"), t: "Contaste cómo está hoy", d: "Último aceite, service y VTV", accion: "Completar", fn: onEstado },
    { ok: v.seguroMensual != null, t: "Cargaste el seguro", d: "Para sumar la cuota a tus gastos", accion: "Cargar", fn: onEstado },
    { ok: v.cargas.length > 0, t: "Primera carga de nafta", d: "Tocá Cargar y decilo con tu voz", accion: "Cargar", fn: onCarga },
    { ok: det.rendimientos.length > 0, t: "Ver tu rendimiento", d: "2 cargas con tanque lleno y km", accion: "Cargar", fn: onCarga },
    { ok: bot, t: "Probá el bot de Telegram", d: "Mandale /estado y mirá la magia", accion: "Hecho", fn: () => { guardarLocal(claveBot, "1"); setBot(true); } },
  ];
  const hechos = pasos.filter(p => p.ok).length;
  if (oculto || hechos === pasos.length) return null;

  return (
    <div className="card" style={{ borderColor: "rgba(245,158,11,.4)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>🚀 Primeros pasos · {hechos}/{pasos.length}</div>
        <button onClick={() => { guardarLocal(clave, "1"); setOculto(true); }} style={{ border: "none", background: "none", color: "var(--tx3)", fontSize: 11, padding: 0 }}>Ocultar</button>
      </div>
      <div className="vh-progress" style={{ marginBottom: 10 }}><div style={{ width: `${(hechos / pasos.length) * 100}%` }} /></div>
      {pasos.filter(p => !p.ok).slice(0, 3).map(p => (
        <div key={p.t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
          <div style={{ width: 20, height: 20, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
            background: p.ok ? "var(--sal)" : "transparent", border: p.ok ? "none" : "1.5px solid var(--bd)", color: "#000" }}>{p.ok ? "✓" : ""}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ textDecoration: p.ok ? "line-through" : "none", color: p.ok ? "var(--tx3)" : "var(--tx)" }}>{p.t}</div>
            {!p.ok && p.d && <div style={{ fontSize: 11, color: "var(--tx3)" }}>{p.d}</div>}
          </div>
          {!p.ok && p.fn && <button onClick={p.fn} style={{ fontSize: 11, padding: "3px 10px" }}>{p.accion}</button>}
        </div>
      ))}
    </div>
  );
}
