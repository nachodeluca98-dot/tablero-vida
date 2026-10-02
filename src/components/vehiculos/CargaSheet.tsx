"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CON_VENCIMIENTO, Campo, Sheet, TIPOS, TIPO_EMOJI, TIPO_LABEL, Tip, api, hoy } from "./comun";

export type Opcion = "carga" | "mantenimiento" | "reparacion";
export type Preset = { opcion: Opcion; tipo?: string; manual?: boolean };

const OPCIONES: Record<Opcion, { emoji: string; titulo: string; sub: string; guia: string; ejemplo: string; tips: string[] }> = {
  carga: {
    emoji: "⛽", titulo: "Cargué nafta", sub: "Litros, cuánto pagaste y km",
    guia: "Decí cuántos litros cargaste, cuánto pagaste y cuántos km marca el auto.",
    ejemplo: "Cargué 35 litros, 45 lucas, 87.400 km, tanque lleno",
    tips: [
      "Si llenaste el tanque, decilo: así mido el rendimiento real.",
      "Podés decir \"ayer\" o \"el sábado\" y lo fecho solo.",
      "Los km los ves en el tablero del auto: con eso calculo todo lo demás.",
    ],
  },
  mantenimiento: {
    emoji: "🔧", titulo: "Mantenimiento", sub: "Service, aceite, VTV, gomas, correa",
    guia: "Contá qué se hizo, cuánto salió, dónde y con cuántos km.",
    ejemplo: "Hice el service de los 90 mil en la concesionaria, 180 lucas, 90.200 km",
    tips: [
      "Decí los km: con eso calculo cuándo toca el próximo.",
      "Si la VTV tiene fecha de vencimiento en la oblea, decila y la agendo.",
      "Podés cargar varios en uno: \"cambio de aceite y filtros\".",
    ],
  },
  reparacion: {
    emoji: "🔩", titulo: "Reparación o arreglo", sub: "Algo que se rompió o falló",
    guia: "Contá qué tuviste que hacer, cuánto te salió, dónde lo hiciste y algún comentario.",
    ejemplo: "Arreglé una pérdida de aceite, cambiaron la junta del cárter, 120 lucas en el taller de Juan en Ramos. Me dijo que revise el nivel en un mes.",
    tips: [
      "Contá lo que te recomendó el mecánico: queda guardado como comentario.",
      "Mencioná el taller: después lo encontrás fácil en el historial.",
    ],
  },
};

const vacio = (tipo = "service") => ({
  fecha: hoy(), litros: "", monto: "", odometro: "", tanqueLleno: true,
  tipo, descripcion: "", taller: "", notas: "", venceFecha: "",
});

export default function CargaSheet({ abierto, onCerrar, vehiculos, vehiculoId, preset, onGuardado }: {
  abierto: boolean;
  onCerrar: () => void;
  vehiculos: any[];
  vehiculoId: string | null;
  preset: Preset | null;
  onGuardado: (resp: any, vehiculoId: string) => void;
}) {
  const [paso, setPaso] = useState<"tipo" | "contar" | "revisar">("tipo");
  const [opcion, setOpcion] = useState<Opcion>("carga");
  const [vid, setVid] = useState<string | null>(vehiculoId);
  const [f, setF] = useState<any>(vacio());
  const [texto, setTexto] = useState("");
  const [origen, setOrigen] = useState<{ fuente: "texto" | "voz"; raw: string } | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState<"" | "interpretando" | "guardando">("");
  const [hayMic, setHayMic] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const w = window as any;
    setHayMic(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // Reinicia el flujo cada vez que se abre
  useEffect(() => {
    if (!abierto) { recRef.current?.abort?.(); return; }
    const op = preset?.opcion ?? "carga";
    setOpcion(op);
    setVid(vehiculoId);
    setF(vacio(preset?.tipo ?? (op === "reparacion" ? "reparacion" : "service")));
    setTexto(""); setOrigen(null); setMarcados(new Set()); setAvisos([]); setError(""); setOcupado(""); setEscuchando(false);
    setPaso(preset?.manual ? "revisar" : preset ? "contar" : "tipo");
  }, [abierto, preset, vehiculoId]);

  const info = OPCIONES[opcion];
  const tip = useMemo(() => info.tips[Math.floor(Math.random() * info.tips.length)], [info, abierto]); // eslint-disable-line react-hooks/exhaustive-deps
  const kind = opcion === "carga" ? "carga" : "mantenimiento";

  function elegir(op: Opcion) {
    setOpcion(op);
    setF(vacio(op === "reparacion" ? "reparacion" : "service"));
    setPaso("contar");
  }

  async function interpretar(t: string, fuente: "texto" | "voz") {
    if (!t.trim()) return;
    setError(""); setAvisos([]); setOcupado("interpretando");
    try {
      const r = await api("/api/vehiculos/interpretar", "POST", { texto: t, vehiculoId: vid, kind });
      const v = r.valores;
      if (r.kind === "carga") setOpcion("carga");
      else if (opcion === "carga") setOpcion(v.tipo === "reparacion" ? "reparacion" : "mantenimiento");
      setF({
        ...vacio(),
        fecha: v.fecha || hoy(),
        litros: v.litros ?? "",
        monto: v.monto != null ? Math.round(v.monto) : "",
        odometro: v.odometro ?? "",
        tanqueLleno: v.tanqueLleno !== false,
        tipo: v.tipo && TIPOS.includes(v.tipo) ? v.tipo : opcion === "reparacion" ? "reparacion" : "otro",
        descripcion: v.descripcion ?? "",
        taller: v.taller ?? "",
        notas: v.notas ?? "",
        venceFecha: v.venceFecha ?? "",
      });
      setMarcados(new Set(r.faltan));
      setAvisos(r.avisos ?? []);
      setOrigen({ fuente, raw: t });
      if (r.vehiculoId) setVid(r.vehiculoId);
      setPaso("revisar");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOcupado("");
    }
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
      if (e.error === "not-allowed") setError("Necesito permiso para usar el micrófono. Activalo en el navegador o escribilo abajo.");
    };
    rec.onend = () => {
      setEscuchando(false);
      if (final.trim()) interpretar(final.trim(), "voz");
    };
    recRef.current = rec;
    setError(""); setTexto(""); setEscuchando(true);
    rec.start();
  }

  async function guardar() {
    if (!vid) { setError("Elegí el vehículo."); return; }
    setError(""); setOcupado("guardando");
    try {
      const resp = await api(`/api/vehiculos/${vid}/registros`, "POST", { kind, ...f, fuente: origen?.fuente, rawInput: origen?.raw });
      onGuardado(resp, vid);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOcupado("");
    }
  }

  const cambiar = (k: string, valor: any) => {
    setF((p: any) => ({ ...p, [k]: valor }));
    if (marcados.has(k)) setMarcados(m => { const n = new Set(m); n.delete(k); return n; });
  };
  const input = (k: string, label: string, type = "number", full = false, placeholder = "") => (
    <Campo label={label} marcado={marcados.has(k)} full={full}>
      <input type={type} inputMode={type === "number" ? "decimal" : undefined} value={f[k]} placeholder={placeholder}
        onChange={e => cambiar(k, e.target.value)} style={marcados.has(k) ? { borderColor: "var(--red)" } : undefined} />
    </Campo>
  );

  const titulo = paso === "tipo" ? "¿Qué querés cargar?" : `${info.emoji} ${info.titulo}`;
  const pasoN = paso === "tipo" ? 1 : paso === "contar" ? 2 : 3;

  return (
    <Sheet abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }} aria-hidden>
        {[1, 2, 3].map(n => <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= pasoN ? "var(--acc)" : "var(--bd)" }} />)}
      </div>

      {vehiculos.length > 1 && paso !== "tipo" && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14 }}>
          {vehiculos.map(v => (
            <button key={v.id} className={`vh-chip ${v.id === vid ? "on" : ""}`} onClick={() => setVid(v.id)}>{v.alias}</button>
          ))}
        </div>
      )}

      {paso === "tipo" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(Object.keys(OPCIONES) as Opcion[]).map(op => (
            <button key={op} className="vh-big" onClick={() => elegir(op)}>
              <span style={{ fontSize: 26 }}>{OPCIONES[op].emoji}</span>
              <span>
                <div>{OPCIONES[op].titulo}</div>
                <div style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 400 }}>{OPCIONES[op].sub}</div>
              </span>
            </button>
          ))}
        </div>
      )}

      {paso === "contar" && (
        <div>
          <div style={{ fontSize: 14, marginBottom: 4 }}>{info.guia}</div>
          <div style={{ fontSize: 12, color: "var(--tx3)", fontStyle: "italic", marginBottom: 18 }}>Ej: &quot;{info.ejemplo}&quot;</div>

          {hayMic && (
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <button className={`vh-mic ${escuchando ? "rec" : ""}`} onClick={grabar} disabled={ocupado === "interpretando"}
                aria-label={escuchando ? "Terminar grabación" : "Grabar audio"}>
                {ocupado === "interpretando" ? "⏳" : escuchando ? "■" : "🎙"}
              </button>
              <div style={{ fontSize: 13, color: "var(--tx2)", marginTop: 10 }}>
                {ocupado === "interpretando" ? "Entendiendo lo que dijiste..." : escuchando ? "Te escucho. Tocá para terminar." : "Tocá y hablá"}
              </div>
              {escuchando && texto && <div style={{ fontSize: 13, color: "var(--tx)", marginTop: 8 }}>&quot;{texto}&quot;</div>}
            </div>
          )}

          {!escuchando && (
            <>
              <textarea rows={hayMic ? 2 : 3} value={texto} placeholder={hayMic ? "o escribilo acá" : "Escribilo acá (o usá el micrófono del teclado)"}
                onChange={e => setTexto(e.target.value)} style={{ resize: "vertical" }} />
              <button className={hayMic ? "" : "primary"} disabled={!!ocupado || !texto.trim()} onClick={() => interpretar(texto, "texto")}
                style={{ width: "100%", marginTop: 8, padding: 10 }}>
                {ocupado === "interpretando" ? "Entendiendo..." : "Completar con IA"}
              </button>
            </>
          )}

          {error && <div style={{ color: "var(--red-t)", fontSize: 12, marginTop: 10 }}>{error}</div>}
          <div style={{ marginTop: 14 }}><Tip>{tip}</Tip></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button onClick={() => setPaso("tipo")} style={{ border: "none", background: "none", color: "var(--tx3)", padding: 0 }}>← Volver</button>
            <button onClick={() => setPaso("revisar")} style={{ border: "none", background: "none", color: "var(--tx2)", padding: 0, textDecoration: "underline" }}>
              Completar a mano
            </button>
          </div>
        </div>
      )}

      {paso === "revisar" && (
        <div>
          {origen && (
            <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 10 }}>
              {origen.fuente === "voz" ? "🎙" : "💬"} &quot;{origen.raw.length > 140 ? origen.raw.slice(0, 140) + "…" : origen.raw}&quot;
              <div style={{ color: "var(--tx2)", marginTop: 4 }}>Revisá que esté bien y guardá.</div>
            </div>
          )}
          {avisos.map(a => <div key={a} style={{ fontSize: 12, color: "var(--amb-t)", marginBottom: 8 }}>⚠️ {a}</div>)}

          {kind === "carga" ? (
            <div className="vh-2">
              {input("litros", "Litros")}
              {input("monto", "Pagaste $")}
              {input("odometro", "Km del auto")}
              {input("fecha", "Fecha", "date")}
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={f.tanqueLleno} onChange={e => cambiar("tanqueLleno", e.target.checked)} />
                Llené el tanque
              </label>
            </div>
          ) : (
            <div className="vh-2">
              <Campo label="Tipo" full>
                <select value={f.tipo} onChange={e => cambiar("tipo", e.target.value)}>
                  {TIPOS.map(t => <option key={t} value={t}>{TIPO_EMOJI[t]} {TIPO_LABEL[t]}</option>)}
                </select>
              </Campo>
              {input("descripcion", "Qué se hizo", "text", true)}
              {input("monto", "Cuánto salió $")}
              {input("odometro", "Km del auto")}
              {input("taller", "Dónde (taller, mecánico)", "text", true)}
              {input("notas", "Comentario", "text", true)}
              {input("fecha", "Fecha", "date")}
              {CON_VENCIMIENTO.has(f.tipo) && input("venceFecha", "Vence", "date")}
            </div>
          )}

          {error && <div style={{ color: "var(--red-t)", fontSize: 12, marginTop: 10 }}>{error}</div>}
          <button className="primary" disabled={!!ocupado} onClick={guardar} style={{ width: "100%", marginTop: 16, padding: 12, fontSize: 15 }}>
            {ocupado === "guardando" ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={() => setPaso("contar")} style={{ width: "100%", marginTop: 8, border: "none", background: "none", color: "var(--tx3)" }}>
            {origen ? "Volver a contar" : "← Volver"}
          </button>
        </div>
      )}
    </Sheet>
  );
}
