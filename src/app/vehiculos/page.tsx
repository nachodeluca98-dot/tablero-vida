"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// El seguro no va acá: se maneja como cuota mensual
const TIPOS = ["reparacion", "aceite", "service", "neumaticos", "correa", "presion", "vtv", "patente", "otro"];
const TIPO_LABEL: Record<string, string> = {
  service: "Service", aceite: "Aceite y filtro", neumaticos: "Neumáticos", correa: "Correa de distribución", presion: "Presión de neumáticos", vtv: "VTV",
  seguro: "Seguro (cuota)", patente: "Patente", reparacion: "Reparación", otro: "Otro",
};
const TIPO_EMOJI: Record<string, string> = {
  service: "🔧", aceite: "🛢️", neumaticos: "🛞", correa: "⚙️", presion: "🌬️", vtv: "📋", seguro: "🛡️", patente: "🧾", reparacion: "🔩", otro: "📌",
};
// Agrupación de gastos para el desglose
const CATEGORIA: Record<string, string> = {
  aceite: "Mantenimiento", service: "Mantenimiento", neumaticos: "Mantenimiento", correa: "Mantenimiento", presion: "Mantenimiento",
  reparacion: "Reparaciones", otro: "Reparaciones",
  vtv: "Impuestos y seguro", seguro: "Impuestos y seguro", patente: "Impuestos y seguro",
};
const CON_VENCIMIENTO = new Set(["vtv", "patente"]);

const km = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("es-AR"));
const pesos = (n: number | null | undefined) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("es-AR"));
const fecha = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }) : "—";
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

const COLOR_ESTADO: Record<string, string> = { vencido: "red", proximo: "amb", ok: "sal", sin_datos: "met" };

function textoVenc(v: any) {
  if (v.estado === "sin_datos") return "Sin registro";
  const p: string[] = [];
  if (v.kmRestantes != null) p.push(v.kmRestantes < 0 ? `+${km(-v.kmRestantes)} km` : `${km(v.kmRestantes)} km`);
  if (v.diasRestantes != null) p.push(v.diasRestantes < 0 ? `hace ${-v.diasRestantes} d` : v.diasRestantes === 0 ? "hoy" : `${v.diasRestantes} d`);
  return p.join(" · ");
}

function VencTag({ v }: { v: any }) {
  const c = COLOR_ESTADO[v.estado];
  return (
    <span className="tag" style={{ background: `var(--${c}-b)`, color: `var(--${c}-t)`, textTransform: "none" }}>
      {v.emoji} {v.label} · {textoVenc(v)}
    </span>
  );
}

function GraficoRendimiento({ puntos }: { puntos: any[] }) {
  if (puntos.length < 2) {
    return <div style={{ color: "var(--tx3)", fontSize: 12 }}>Se necesitan al menos 3 cargas de tanque lleno con km para ver la evolución.</div>;
  }
  const W = 600, H = 160, P = 28;
  const ys = puntos.map(p => p.kmL);
  const min = Math.floor(Math.min(...ys) - 1), max = Math.ceil(Math.max(...ys) + 1);
  const x = (i: number) => P + (i * (W - 2 * P)) / (puntos.length - 1);
  const y = (v: number) => H - P - ((v - min) * (H - 2 * P)) / (max - min || 1);
  const d = puntos.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.kmL)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {[min, (min + max) / 2, max].map(v => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="var(--bd)" />
          <text x={2} y={y(v) + 4} fontSize="10" fill="var(--tx3)">{v.toFixed(0)}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--acc)" strokeWidth="2" />
      {puntos.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.kmL)} r="3" fill="var(--acc)">
          <title>{`${fecha(p.fecha)}: ${p.kmL.toFixed(1)} km/L`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FormVehiculo({ inicial, onGuardar, onCancelar }: { inicial?: any; onGuardar: (v: any) => Promise<void>; onCancelar: () => void }) {
  const [f, setF] = useState<any>(inicial ?? { alias: "", marca: "", modelo: "", anio: "", patente: "", kmActual: "" });
  const [guardando, setGuardando] = useState(false);
  const campo = (k: string, label: string, type = "text", placeholder = "") => (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 4 }}>{label}</div>
      <input type={type} value={f[k] ?? ""} placeholder={placeholder} onChange={e => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">{inicial ? "Editar vehículo" : "Nuevo vehículo"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {campo("alias", "Alias (cómo lo nombrás)", "text", "el Gol")}
        {campo("marca", "Marca", "text", "Volkswagen")}
        {campo("modelo", "Modelo", "text", "Gol Trend")}
        {campo("anio", "Año", "number")}
        {campo("patente", "Patente")}
        {!inicial && campo("kmActual", "Km actuales", "number")}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="primary" disabled={guardando || !f.alias?.trim()} onClick={async () => {
          setGuardando(true);
          try { await onGuardar(f); } finally { setGuardando(false); }
        }}>{guardando ? "Guardando..." : "Guardar"}</button>
        <button onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

const GUIA = {
  carga: {
    titulo: "Contá la carga",
    texto: "Cuántos litros cargaste, cuánto pagaste y cuántos km marca el auto.",
    ejemplo: "Cargué 35 litros, 45 lucas, 87.400 km, tanque lleno",
  },
  mantenimiento: {
    titulo: "Contá qué pasó",
    texto: "Qué tuviste que hacer, cuánto te salió, dónde lo hiciste y algún comentario.",
    ejemplo: "Arreglé una pérdida de aceite, cambiaron la junta del cárter, 120 lucas en el taller de Juan en Ramos. Me dijo que revise el nivel en un mes.",
  },
};

function FormRegistro({ vehiculoId, onGuardado, onCambiarVehiculo }: {
  vehiculoId: string; onGuardado: () => void; onCambiarVehiculo: (id: string) => void;
}) {
  const [kind, setKind] = useState<"carga" | "mantenimiento">("carga");
  const vacio = () => ({
    fecha: hoy(), litros: "", monto: "", odometro: "", tanqueLleno: true,
    tipo: "reparacion", descripcion: "", taller: "", notas: "", venceFecha: "",
  });
  const [f, setF] = useState<any>(vacio);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [texto, setTexto] = useState("");
  const [interpretando, setInterpretando] = useState(false);
  const [origen, setOrigen] = useState<{ fuente: "texto" | "voz"; raw: string } | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [avisos, setAvisos] = useState<string[]>([]);
  const [hayMic, setHayMic] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const w = window as any;
    setHayMic(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  function limpiar() {
    setF(vacio());
    setTexto("");
    setOrigen(null);
    setMarcados(new Set());
    setAvisos([]);
  }

  async function interpretar(t: string, fuente: "texto" | "voz") {
    if (!t.trim()) return;
    setError("");
    setAvisos([]);
    setInterpretando(true);
    const res = await fetch("/api/vehiculos/interpretar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: t, vehiculoId, kind }),
    }).catch(() => null);
    setInterpretando(false);
    const r = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { setError(r.error || "No pude interpretarlo. Probá de nuevo o completalo a mano."); return; }

    const v = r.valores;
    setKind(r.kind);
    setF({
      ...vacio(),
      fecha: v.fecha || hoy(),
      litros: v.litros ?? "",
      monto: v.monto != null ? Math.round(v.monto) : "",
      odometro: v.odometro ?? "",
      tanqueLleno: v.tanqueLleno !== false,
      tipo: v.tipo && TIPOS.includes(v.tipo) ? v.tipo : "otro",
      descripcion: v.descripcion ?? "",
      taller: v.taller ?? "",
      notas: v.notas ?? "",
      venceFecha: v.venceFecha ?? "",
    });
    setMarcados(new Set(r.faltan));
    setAvisos(r.avisos ?? []);
    setOrigen({ fuente, raw: t });
    if (r.vehiculoId && r.vehiculoId !== vehiculoId) onCambiarVehiculo(r.vehiculoId);
  }

  function grabar() {
    if (escuchando) { recRef.current?.stop(); return; }
    const w = window as any;
    const rec = new (w.SpeechRecognition || w.webkitSpeechRecognition)();
    rec.lang = "es-AR";
    rec.interimResults = true;
    rec.continuous = true;
    let final = "";
    rec.onresult = (e: any) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else parcial += e.results[i][0].transcript;
      }
      setTexto((final + parcial).trim());
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed") setError("Necesito permiso para usar el micrófono.");
    };
    rec.onend = () => {
      setEscuchando(false);
      if (final.trim()) interpretar(final.trim(), "voz");
    };
    recRef.current = rec;
    setError("");
    setTexto("");
    setEscuchando(true);
    rec.start();
  }

  async function guardar() {
    setError("");
    setGuardando(true);
    const res = await fetch(`/api/vehiculos/${vehiculoId}/registros`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...f, fuente: origen?.fuente, rawInput: origen?.raw }),
    });
    setGuardando(false);
    if (!res.ok) { setError((await res.json()).error || "Error"); return; }
    limpiar();
    onGuardado();
  }

  const cambiar = (k: string, valor: any) => {
    setF({ ...f, [k]: valor });
    if (marcados.has(k)) setMarcados(m => { const n = new Set(m); n.delete(k); return n; });
  };

  const input = (k: string, label: string, type = "number", placeholder = "") => (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, color: marcados.has(k) ? "var(--red-t)" : "var(--tx3)", marginBottom: 4 }}>
        {label}{marcados.has(k) ? " · revisar" : ""}
      </div>
      <input type={type} inputMode={type === "number" ? "decimal" : undefined} value={f[k]} placeholder={placeholder}
        onChange={e => cambiar(k, e.target.value)}
        style={marcados.has(k) ? { borderColor: "var(--red)" } : undefined} />
    </label>
  );

  const guia = GUIA[kind];
  const lleno = !!origen;

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["carga", "mantenimiento"] as const).map(k => (
          <button key={k} onClick={() => { setKind(k); if (!origen) setError(""); }} className={kind === k ? "primary" : ""}
            style={{ flex: 1, fontSize: 12, padding: "8px 10px" }}>
            {k === "carga" ? "⛽ Combustible" : "🔧 Mantenimiento o reparación"}
          </button>
        ))}
      </div>

      <div style={{ background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{guia.titulo}</div>
        <div style={{ color: "var(--tx2)", fontSize: 12, marginBottom: 4 }}>{guia.texto}</div>
        <div style={{ color: "var(--tx3)", fontSize: 11, fontStyle: "italic", marginBottom: 10 }}>Ej: &quot;{guia.ejemplo}&quot;</div>
        {hayMic && (
          <button onClick={grabar} disabled={interpretando} className={escuchando ? "" : "primary"}
            style={{ width: "100%", padding: "12px", fontSize: 14, marginBottom: 8,
              background: escuchando ? "var(--red)" : undefined, borderColor: escuchando ? "var(--red)" : undefined, color: escuchando ? "#fff" : undefined }}>
            {escuchando ? "■ Terminar y completar" : interpretando ? "Interpretando..." : "🎙 Grabar audio"}
          </button>
        )}
        {escuchando && texto && <div style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 8 }}>{texto}</div>}
        {!escuchando && (
          <div style={{ display: "flex", gap: 6 }}>
            <input type="text" value={texto} placeholder={hayMic ? "o escribilo acá" : "Escribilo acá"}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") interpretar(texto, "texto"); }}
              style={{ flex: 1, minWidth: 0 }} />
            <button disabled={interpretando || !texto.trim()} onClick={() => interpretar(texto, "texto")}>
              {interpretando ? "..." : "Completar"}
            </button>
          </div>
        )}
      </div>
      {avisos.map(a => <div key={a} style={{ fontSize: 12, color: "var(--amb-t)", marginBottom: 8 }}>⚠️ {a}</div>)}
      {error && <div style={{ color: "var(--red-t)", fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 8 }}>
        {lleno ? `Completado desde ${origen!.fuente === "voz" ? "🎙 audio" : "💬 texto"}: revisá y registrá` : "O completalo a mano"}
      </div>
      {kind === "carga" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {input("fecha", "Fecha", "date")}
          {input("litros", "Litros")}
          {input("monto", "Monto $")}
          {input("odometro", "Km")}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 4 }}>Tipo</div>
            <select value={f.tipo} onChange={e => cambiar("tipo", e.target.value)}>
              {TIPOS.map(t => <option key={t} value={t}>{TIPO_EMOJI[t]} {TIPO_LABEL[t]}</option>)}
            </select>
          </label>
          {input("fecha", "Fecha", "date")}
          {input("monto", "Cuánto salió $")}
          {input("odometro", "Km")}
          <div style={{ gridColumn: "1 / -1" }}>{input("descripcion", "Qué se hizo", "text")}</div>
          <div style={{ gridColumn: "1 / -1" }}>{input("taller", "Dónde (taller, mecánico)", "text")}</div>
          <div style={{ gridColumn: "1 / -1" }}>{input("notas", "Comentario", "text")}</div>
          {CON_VENCIMIENTO.has(f.tipo) && input("venceFecha", "Vence (opcional)", "date")}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        {kind === "carga" && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={f.tanqueLleno} onChange={e => cambiar("tanqueLleno", e.target.checked)} />
            Tanque lleno
          </label>
        )}
        <button className="primary" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Registrar"}</button>
        {lleno && <button onClick={limpiar} style={{ fontSize: 11 }}>Descartar</button>}
      </div>
    </div>
  );
}

// Filas del estado inicial: se muestran solo las que todavía no tienen registro
const INICIAL = [
  { tipo: "aceite", label: "🛢️ Último cambio de aceite", conKm: true },
  { tipo: "service", label: "🔧 Último service", conKm: true },
  { tipo: "correa", label: "⚙️ Último cambio de correa de distribución", conKm: true },
  { tipo: "vtv", label: "📋 Última VTV", conKm: false, conVence: true },
  { tipo: "neumaticos", label: "🛞 Última rotación de neumáticos", conKm: true },
] as const;

function EstadoInicial({ det, onGuardado }: { det: any; onGuardado: () => void }) {
  const v = det.vehiculo;
  const claveOculto = `vehiculos-inicial-oculto-${v.id}`;
  const [oculto, setOculto] = useState(true);
  const [f, setF] = useState<any>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    try { setOculto(localStorage.getItem(claveOculto) === "1"); } catch { setOculto(false); }
  }, [claveOculto]);

  const sinDatos = new Set(det.vencimientos.filter((x: any) => x.estado === "sin_datos").map((x: any) => x.tipo));
  const filas = INICIAL.filter(r => sinDatos.has(r.tipo));
  const faltaSeguro = v.seguroMensual == null;
  const faltaKm = v.kmActual == null;
  if (oculto || (!filas.length && !faltaSeguro && !faltaKm)) return null;

  const set = (k: string, campo: string, val: string) => setF((p: any) => ({ ...p, [k]: { ...p[k], [campo]: val } }));

  async function guardar() {
    setGuardando(true);
    await fetch(`/api/vehiculos/${v.id}/inicial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, kmActual: f.km?.valor }),
    });
    setGuardando(false);
    setF({});
    onGuardado();
  }

  function ocultar() {
    try { localStorage.setItem(claveOculto, "1"); } catch {}
    setOculto(true);
  }

  const lbl = (t: string) => <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 4 }}>{t}</div>;

  return (
    <div className="card" style={{ borderColor: "var(--acc)" }}>
      <div className="card-title" style={{ color: "var(--acc)" }}>Arranquemos: estado actual de {v.alias}</div>
      <div style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 12 }}>
        Con esto calculo los próximos vencimientos desde hoy. Completá lo que sepas, lo demás lo dejás vacío.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {faltaKm && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>📍 Km actuales</div>
            <input type="number" inputMode="numeric" value={f.km?.valor ?? ""} onChange={e => set("km", "valor", e.target.value)} />
          </div>
        )}
        {filas.map(r => (
          <div key={r.tipo}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{r.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label>{lbl("Fecha")}<input type="date" value={f[r.tipo]?.fecha ?? ""} onChange={e => set(r.tipo, "fecha", e.target.value)} /></label>
              {r.conKm && <label>{lbl("Km")}<input type="number" inputMode="numeric" value={f[r.tipo]?.km ?? ""} onChange={e => set(r.tipo, "km", e.target.value)} /></label>}
              {"conVence" in r && <label>{lbl("Vence (si figura en la oblea)")}<input type="date" value={f[r.tipo]?.vence ?? ""} onChange={e => set(r.tipo, "vence", e.target.value)} /></label>}
            </div>
          </div>
        ))}
        {faltaSeguro && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>🛡️ Seguro</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label>{lbl("Cuota mensual actual $")}<input type="number" inputMode="numeric" value={f.seguro?.monto ?? ""} onChange={e => set("seguro", "monto", e.target.value)} /></label>
              <label>{lbl("Compañía (opcional)")}<input type="text" value={f.seguro?.compania ?? ""} onChange={e => set("seguro", "compania", e.target.value)} /></label>
            </div>
            <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Se registra solo todos los meses; si cambia, lo actualizás en un toque.</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="primary" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Guardar"}</button>
        <button onClick={ocultar}>Ahora no</button>
      </div>
    </div>
  );
}

function Seguro({ v, onGuardar }: { v: any; onGuardar: (data: any) => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState("");
  const [compania, setCompania] = useState("");
  const abrir = () => { setMonto(v.seguroMensual ?? ""); setCompania(v.seguroCompania ?? ""); setEditando(true); };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>🛡️ Seguro</div>
          {v.seguroMensual != null
            ? <div><span style={{ fontSize: 18, fontWeight: 700 }}>{pesos(v.seguroMensual)}</span><span style={{ color: "var(--tx3)" }}> /mes{v.seguroCompania ? ` · ${v.seguroCompania}` : ""}</span></div>
            : <div style={{ color: "var(--tx3)", fontSize: 12 }}>Sin cargar</div>}
        </div>
        {!editando && <button onClick={abrir}>{v.seguroMensual != null ? "Actualizar monto" : "Cargar"}</button>}
      </div>
      {editando && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 4 }}>Cuota mensual $</div>
            <input type="number" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 4 }}>Compañía</div>
            <input type="text" value={compania} onChange={e => setCompania(e.target.value)} />
          </label>
          <button className="primary" onClick={async () => { await onGuardar({ seguroMensual: monto, seguroCompania: compania }); setEditando(false); }}>Guardar</button>
          <button onClick={() => setEditando(false)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

function Reglas() {
  const [reglas, setReglas] = useState<any[]>([]);
  const [guardado, setGuardado] = useState<string | null>(null);
  useEffect(() => { fetch("/api/vehiculos/reglas").then(r => r.json()).then((rs: any[]) => setReglas(rs.filter(r => r.tipo !== "seguro"))); }, []);

  async function guardar(r: any) {
    await fetch("/api/vehiculos/reglas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    setGuardado(r.id);
    setTimeout(() => setGuardado(null), 1500);
  }
  const set = (id: string, k: string, v: any) => setReglas(rs => rs.map(r => (r.id === id ? { ...r, [k]: v } : r)));

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div className="card-title">Intervalos de mantenimiento</div>
      <table>
        <thead>
          <tr><th>Tipo</th><th>Cada km</th><th>Cada meses</th><th>Avisar km antes</th><th>Avisar días antes</th><th>Activa</th><th></th></tr>
        </thead>
        <tbody>
          {reglas.map(r => (
            <tr key={r.id}>
              <td style={{ whiteSpace: "nowrap" }}>{TIPO_EMOJI[r.tipo]} {TIPO_LABEL[r.tipo] ?? r.tipo}</td>
              {(["cadaKm", "cadaMeses", "avisoKmAntes", "avisoDiasAntes"] as const).map(k => (
                <td key={k} style={{ minWidth: 80 }}>
                  <input type="number" value={r[k] ?? ""} onChange={e => set(r.id, k, e.target.value)} />
                </td>
              ))}
              <td><input type="checkbox" checked={r.activa} onChange={e => set(r.id, "activa", e.target.checked)} /></td>
              <td><button onClick={() => guardar(r)} style={{ fontSize: 11 }}>{guardado === r.id ? "✓" : "Guardar"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NIVELES = [
  { key: "urgente", label: "Urgente", color: "red" },
  { key: "importante", label: "Importante", color: "amb" },
  { key: "relevante", label: "Relevante", color: "ges" },
] as const;
const PIDE_KM = new Set(["aceite", "service", "neumaticos", "correa"]);

function ItemPendiente({ p, mostrarAlias, onListo }: { p: any; mostrarAlias: boolean; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [kmVal, setKmVal] = useState<string>(p.kmHoy != null ? String(p.kmHoy) : "");
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function hecho(extra: any = {}) {
    setEnviando(true);
    await fetch(`/api/vehiculos/${p.vehiculoId}/hecho`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: p.tipo, ...extra }),
    });
    setEnviando(false);
    setAbierto(false);
    onListo();
  }

  async function cambioSeguro() {
    const nuevo = prompt("¿Cuál es la cuota mensual actual del seguro?");
    const n = Number(String(nuevo ?? "").replace(/[^\d]/g, ""));
    if (!n) return;
    await fetch(`/api/vehiculos/${p.vehiculoId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seguroMensual: n }),
    });
    onListo();
  }

  const btn = { fontSize: 11, padding: "3px 10px" };
  return (
    <div style={{ padding: "8px 0", borderTop: "1px solid var(--bd)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{p.emoji} {p.titulo}</div>
          <div style={{ fontSize: 11, color: "var(--tx3)" }}>{mostrarAlias ? `${p.alias} · ` : ""}{p.detalle}</div>
        </div>
        {!abierto && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {p.tipo === "seguro" ? (
              <>
                <button style={btn} disabled={enviando} onClick={() => hecho()}>✓ Está bien</button>
                <button style={btn} onClick={cambioSeguro}>Cambió</button>
              </>
            ) : (
              <button style={btn} disabled={enviando} onClick={() => (PIDE_KM.has(p.tipo) ? setAbierto(true) : hecho())}>✓ Hecho</button>
            )}
          </div>
        )}
      </div>
      {abierto && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: 1, minWidth: 90 }}>
            <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 3 }}>Km</div>
            <input type="number" inputMode="numeric" value={kmVal} onChange={e => setKmVal(e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 90 }}>
            <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 3 }}>Cuánto salió $</div>
            <input type="number" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} />
          </label>
          <button className="primary" style={btn} disabled={enviando} onClick={() => hecho({ odometro: kmVal, monto })}>Guardar</button>
          <button style={btn} onClick={() => setAbierto(false)}>✕</button>
        </div>
      )}
    </div>
  );
}

function Pendientes({ items, variosVehiculos, onListo }: { items: any[]; variosVehiculos: boolean; onListo: () => void }) {
  if (!items.length) {
    return <div className="card" style={{ marginBottom: 16, color: "var(--sal-t)" }}>✨ Nada pendiente con tus vehículos.</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
      {NIVELES.map(n => {
        const lista = items.filter(i => i.nivel === n.key);
        if (!lista.length) return null;
        return (
          <div key={n.key} className="card" style={{ borderColor: `var(--${n.color})`, background: `linear-gradient(var(--${n.color}-b), var(--${n.color}-b)), var(--bg2)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: `var(--${n.color}-t)`, textTransform: "uppercase", letterSpacing: ".06em" }}>{n.label}</div>
              <span className="tag" style={{ background: `var(--${n.color})`, color: "#000" }}>{lista.length}</span>
            </div>
            {lista.map(p => <ItemPendiente key={p.id} p={p} mostrarAlias={variosVehiculos} onListo={onListo} />)}
          </div>
        );
      })}
    </div>
  );
}

export default function Vehiculos() {
  const [lista, setLista] = useState<any[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [det, setDet] = useState<any>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [periodo, setPeriodo] = useState<"30" | "365" | "todo">("365");
  const [pendientes, setPendientes] = useState<any[]>([]);

  const cargarPendientes = useCallback(async () => {
    setPendientes(await fetch("/api/vehiculos/pendientes").then(r => r.json()));
  }, []);
  useEffect(() => { cargarPendientes(); }, [cargarPendientes]);

  const cargarLista = useCallback(async () => {
    const l = await fetch("/api/vehiculos").then(r => r.json());
    setLista(l);
    setSelId(id => id ?? l.find((v: any) => v.activo)?.id ?? null);
  }, []);

  const cargarDetalle = useCallback(async () => {
    if (!selId) { setDet(null); return; }
    setDet(await fetch(`/api/vehiculos/${selId}`).then(r => r.json()));
  }, [selId]);

  useEffect(() => { cargarLista(); }, [cargarLista]);
  useEffect(() => { cargarDetalle(); }, [cargarDetalle]);

  const refrescar = async () => { await Promise.all([cargarLista(), cargarDetalle(), cargarPendientes()]); };

  const historial = useMemo(() => {
    if (!det) return [];
    const c = det.vehiculo.cargas.map((x: any) => ({ ...x, kind: "carga", monto: x.montoTotal }));
    const m = det.vehiculo.mantenimientos.map((x: any) => ({ ...x, kind: "mantenimiento" }));
    return [...c, ...m].sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha) || +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [det]);

  const gastos = useMemo(() => {
    const desde = periodo === "todo" ? 0 : Date.now() - Number(periodo) * 86400000;
    const porCat: Record<string, number> = {};
    for (const h of historial) {
      if (!h.monto || +new Date(h.fecha) < desde) continue;
      const cat = h.kind === "carga" ? "Combustible" : CATEGORIA[h.tipo] ?? "Otros";
      porCat[cat] = (porCat[cat] ?? 0) + h.monto;
    }
    const total = Object.values(porCat).reduce((s, n) => s + n, 0);
    return { porCat: Object.entries(porCat).sort((a, b) => b[1] - a[1]), total };
  }, [historial, periodo]);

  const costoKm = useMemo(() => {
    const odos = historial.filter(h => h.odometro != null).map(h => h.odometro);
    if (odos.length < 2) return null;
    const recorrido = Math.max(...odos) - Math.min(...odos);
    const total = historial.reduce((s, h) => s + (h.monto ?? 0), 0);
    return recorrido > 0 ? total / recorrido : null;
  }, [historial]);

  async function borrar(h: any) {
    if (!confirm("¿Borrar este registro?")) return;
    await fetch(`/api/vehiculos/${selId}/registros?kind=${h.kind}&rid=${h.id}`, { method: "DELETE" });
    refrescar();
  }

  async function patchVehiculo(data: any) {
    await fetch(`/api/vehiculos/${selId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    await refrescar();
  }

  if (!lista) return <div style={{ color: "var(--tx3)" }}>Cargando...</div>;
  const v = det?.vehiculo;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Vehículos</h1>
        {!creando && <button className="primary" onClick={() => setCreando(true)}>+ Vehículo</button>}
      </div>

      {creando && (
        <FormVehiculo
          onCancelar={() => setCreando(false)}
          onGuardar={async f => {
            const nuevo = await fetch("/api/vehiculos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).then(r => r.json());
            setCreando(false);
            setSelId(nuevo.id);
            await Promise.all([cargarLista(), cargarPendientes()]);
          }}
        />
      )}

      {lista.some(x => x.activo) && (
        <Pendientes items={pendientes} variosVehiculos={lista.filter(x => x.activo).length > 1} onListo={refrescar} />
      )}

      {lista.length === 0 && !creando && (
        <div className="card" style={{ color: "var(--tx2)", lineHeight: 1.6 }}>
          Todavía no cargaste ningún vehículo. Tocá <b>+ Vehículo</b> para agregarlo: después te pido el estado
          actual (último cambio de aceite, VTV, seguro) y listo.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginBottom: 20 }}>
        {lista.map(x => {
          const sel = x.id === selId;
          const urgentes = x.vencimientos.filter((y: any) => y.estado !== "sin_datos").slice(0, 3);
          return (
            <div key={x.id} className="card" onClick={() => { setSelId(x.id); setEditando(false); }}
              style={{ cursor: "pointer", borderColor: sel ? "var(--acc)" : undefined, opacity: x.activo ? 1 : 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{x.porDefecto && "⭐ "}{x.alias}</div>
                {x.patente && <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--tx3)" }}>{x.patente}</div>}
              </div>
              <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 10 }}>
                {[x.marca, x.modelo, x.anio].filter(Boolean).join(" ") || "—"}{!x.activo && " · archivado"}
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                <div><div style={{ fontSize: 18, fontWeight: 700 }}>{km(x.kmHoy)}</div><div style={{ fontSize: 10, color: "var(--tx3)" }}>km{x.kmHoy !== x.kmActual ? " (est.)" : ""}</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 700 }}>{x.rendimientoProm ? x.rendimientoProm.toFixed(1) : "—"}</div><div style={{ fontSize: 10, color: "var(--tx3)" }}>km/L prom.</div></div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {urgentes.length ? urgentes.map((y: any) => <VencTag key={y.tipo} v={y} />)
                  : <span style={{ fontSize: 11, color: "var(--tx3)" }}>Sin mantenimientos registrados</span>}
              </div>
            </div>
          );
        })}
      </div>

      {det && v && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>{v.alias}</h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {!v.porDefecto && v.activo && <button onClick={() => patchVehiculo({ porDefecto: true })}>⭐ Por defecto</button>}
              <button onClick={() => setEditando(e => !e)}>Editar</button>
              <button onClick={() => patchVehiculo({ activo: !v.activo })}>{v.activo ? "Archivar" : "Reactivar"}</button>
            </div>
          </div>

          {editando && (
            <FormVehiculo
              inicial={{ alias: v.alias, marca: v.marca ?? "", modelo: v.modelo ?? "", anio: v.anio ?? "", patente: v.patente ?? "" }}
              onCancelar={() => setEditando(false)}
              onGuardar={async f => { await patchVehiculo(f); setEditando(false); }}
            />
          )}

          <EstadoInicial key={`inicial-${v.id}`} det={det} onGuardado={refrescar} />

          <FormRegistro vehiculoId={v.id} onGuardado={refrescar} onCambiarVehiculo={setSelId} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <Stat label="Km actuales" value={km(det.kmHoy)} sub={det.kmDia ? `~${km(det.kmDia)} km/día` : undefined} />
            <Stat label="Rendimiento" value={det.rendimientoProm ? `${det.rendimientoProm.toFixed(1)} km/L` : "—"}
              sub={det.ultimoRendimiento ? `última: ${det.ultimoRendimiento.kmL.toFixed(1)} km/L` : undefined} />
            <Stat label="Costo por km" value={costoKm ? pesos(costoKm) : "—"} sub="todo incluido, histórico" />
            <Stat label={periodo === "todo" ? "Gasto total" : `Gasto ${periodo === "30" ? "30 días" : "12 meses"}`} value={pesos(gastos.total)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card">
              <div className="card-title">Próximos vencimientos</div>
              {det.vencimientos.map((y: any) => (
                <div key={y.tipo} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--bd)", gap: 8 }}>
                  <span>{y.emoji} {y.label}</span>
                  <span className="tag" style={{ background: `var(--${COLOR_ESTADO[y.estado]}-b)`, color: `var(--${COLOR_ESTADO[y.estado]}-t)`, textTransform: "none" }}>
                    {textoVenc(y)}{y.proxKm != null && y.estado !== "sin_datos" ? ` → ${km(y.proxKm)}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div className="card-title" style={{ margin: 0 }}>Gastos</div>
                <select value={periodo} onChange={e => setPeriodo(e.target.value as any)} style={{ width: "auto", fontSize: 11, padding: "2px 6px" }}>
                  <option value="30">30 días</option>
                  <option value="365">12 meses</option>
                  <option value="todo">Todo</option>
                </select>
              </div>
              {gastos.porCat.length === 0 && <div style={{ color: "var(--tx3)", fontSize: 12 }}>Sin gastos en el período.</div>}
              {gastos.porCat.map(([cat, monto]) => (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span>{cat}</span><span style={{ fontWeight: 600 }}>{pesos(monto)}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg3)", borderRadius: 3 }}>
                    <div style={{ height: 6, width: `${(monto / gastos.total) * 100}%`, background: "var(--acc)", borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Seguro key={`seguro-${v.id}`} v={v} onGuardar={patchVehiculo} />

          <div className="card">
            <div className="card-title">Rendimiento (km/L)</div>
            <GraficoRendimiento puntos={det.rendimientos} />
          </div>

          <div className="card">
            <div className="card-title">Historial</div>
            {historial.length === 0 && <div style={{ color: "var(--tx3)", fontSize: 12 }}>Sin registros todavía.</div>}
            {historial.map(h => (
              <div key={h.kind + h.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--bd)", alignItems: "flex-start" }}>
                <div style={{ fontSize: 16, width: 22 }}>{h.kind === "carga" ? "⛽" : TIPO_EMOJI[h.tipo]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    {h.kind === "carga" ? `${h.litros.toLocaleString("es-AR")} L${h.tanqueLleno ? "" : " (parcial)"}` : TIPO_LABEL[h.tipo]}
                    {h.monto ? ` · ${pesos(h.monto)}` : ""}
                    {h.odometro != null ? ` · ${km(h.odometro)} km` : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tx3)" }}>
                    {fecha(h.fecha)}
                    {h.kind === "carga" && h.precioLitro ? ` · ${pesos(h.precioLitro)}/L` : ""}
                    {h.taller ? ` · 📍 ${h.taller}` : ""}
                    {h.venceFecha ? ` · vence ${fecha(h.venceFecha)}` : ""}
                    {h.fuente === "voz" ? " · 🎙" : h.fuente === "texto" ? " · 💬" : h.fuente === "auto" ? " · automático" : ""}
                  </div>
                  {h.descripcion && <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 2 }}>{h.descripcion}</div>}
                  {h.notas && <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2, fontStyle: "italic" }}>💭 {h.notas}</div>}
                </div>
                <button onClick={() => borrar(h)} style={{ fontSize: 11, padding: "2px 8px", color: "var(--tx3)" }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Reglas />
      </div>
    </div>
  );
}
