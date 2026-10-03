"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PILARES, pilarKey, PilarKey } from "@/lib/pilares";
import EditTareaModal from "@/components/EditTareaModal";
import { Campo, Chips, PageHeader, Sheet, TipBanner, Toast, type ToastData, api, guardarLocal, leerLocal, ymdLocal } from "@/components/ui";

function diasAtras(n: number): Date[] {
  const arr: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    arr.push(d);
  }
  return arr;
}
function calcRacha(logs: Map<string, string>): number {
  let r = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (logs.get(ymdLocal(d)) !== "hecho") d.setDate(d.getDate() - 1);
  while (logs.get(ymdLocal(d)) === "hecho") { r++; d.setDate(d.getDate() - 1); }
  return r;
}

const VACIO = { nombre: "", epica: "Nutrición y salud", frecuencia: "Diaria", horario: "" };
const SUGERIDOS = ["💧 Tomar 2L de agua", "🧘 Meditar 10 min", "📖 Leer 20 páginas", "🚶 Caminar 30 min", "😴 Dormir antes de las 00"];

function Celda({ estado, color, onClick, grande }: { estado?: string; color: string; onClick: () => void; grande?: boolean }) {
  const hecho = estado === "hecho", fallado = estado === "fallado";
  const t = grande ? 26 : 22;
  return (
    <button onClick={onClick} title="Tocá para ciclar: vacío → hecho → fallado"
      style={{
        width: t, height: t, padding: 0, borderRadius: 6, flexShrink: 0,
        background: hecho ? `var(--${color})` : fallado ? "var(--red-b)" : "var(--bg3)",
        border: `1px solid ${hecho ? `var(--${color})` : fallado ? "var(--red)" : "var(--bd)"}`,
        color: hecho ? "#000" : fallado ? "var(--red-t)" : "var(--tx3)", fontSize: 11, fontWeight: 700,
      }}>{hecho ? "✓" : fallado ? "✗" : ""}</button>
  );
}

export default function Habitos() {
  const [tareas, setTareas] = useState<any[] | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [vista, setVista] = useState<"hoy" | "historial">("hoy");
  const [filtroPilar, setFiltroPilar] = useState<PilarKey | "todos">("todos");
  const [verNoAun, setVerNoAun] = useState(false);
  const [verOcultos, setVerOcultos] = useState(false);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [nuevo, setNuevo] = useState<any>(VACIO);
  const [editId, setEditId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const cargar = useCallback(async () => {
    const [t, l] = await Promise.all([api("/api/tareas"), api("/api/habitos/logs")]);
    setTareas(t); setLogs(l);
  }, []);
  useEffect(() => {
    cargar();
    const v = leerLocal("habitos-vista");
    if (v === "hoy" || v === "historial") setVista(v);
  }, [cargar]);

  const todos = useMemo(() => (tareas ?? []).filter(t => t.tipo === "Hábito"), [tareas]);
  const habitos = todos
    .filter(t => filtroPilar === "todos" || pilarKey(t.epica) === filtroPilar)
    .filter(t => verNoAun || t.caracterVisibilidad !== "No aún")
    .filter(t => verOcultos || t.mostrarEnHabitos !== false);

  const logsPorTarea = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const l of logs) {
      if (!m.has(l.tareaId)) m.set(l.tareaId, new Map());
      m.get(l.tareaId)!.set(l.fecha, l.estado || "hecho");
    }
    return m;
  }, [logs]);

  const hoy = ymdLocal();
  const semana = diasAtras(7);
  const quincena = diasAtras(14);

  async function marcar(h: any, fecha: string, estado?: "hecho" | "fallado" | "vacio") {
    const r = await api("/api/habitos/toggle", "POST", { tareaId: h.id, fecha, estado });
    setLogs(prev => {
      const sin = prev.filter(l => !(l.tareaId === h.id && l.fecha === fecha));
      return r.estado === "vacio" ? sin : [...sin, { tareaId: h.id, fecha, estado: r.estado }];
    });
    if (fecha === hoy && r.estado === "hecho") {
      setToast({ titulo: `🔥 ${h.nombre}`, lineas: [r.racha > 1 ? `Racha de ${r.racha} días.` : "¡Arrancó la racha!"] });
    }
  }

  async function patch(id: string, data: any) {
    await api(`/api/tareas/${id}`, "PATCH", data);
    cargar();
  }

  async function crear() {
    if (!nuevo.nombre.trim()) return;
    await api("/api/tareas", "POST", { ...nuevo, tipo: "Hábito", caracterVisibilidad: "Relevante", estado: "Sin empezar" });
    setNuevo(VACIO);
    setNuevoAbierto(false);
    setToast({ titulo: "✓ Hábito creado", lineas: ["Marcalo cada día desde acá o desde Hoy."] });
    cargar();
  }

  const cambiarVista = (v: "hoy" | "historial") => { setVista(v); guardarLocal("habitos-vista", v); };
  const hechosHoy = habitos.filter(h => logsPorTarea.get(h.id)?.get(hoy) === "hecho").length;

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader titulo="Hábitos" sub={habitos.length ? `${hechosHoy} de ${habitos.length} hechos hoy` : undefined}>
        <button className="primary" onClick={() => setNuevoAbierto(true)}>+ Hábito</button>
      </PageHeader>

      <TipBanner id="habitos-1">
        Tocá el círculo para marcar el día. Si no lo hiciste, tocá <b>✗</b>: un día fallado corta la racha, pero te muestra el patrón real.
      </TipBanner>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["hoy", "historial"] as const).map(v => (
          <button key={v} className={`vh-tab ${vista === v ? "on" : ""}`} onClick={() => cambiarVista(v)}>{v === "hoy" ? "Hoy" : "Historial 14 días"}</button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <Chips valor={filtroPilar} onChange={setFiltroPilar}
          opciones={[{ key: "todos" as const, label: "Todos" }, ...PILARES.filter(p => todos.some(t => pilarKey(t.epica) === p.key)).map(p => ({ key: p.key, label: `${p.emoji} ${p.short}`, color: p.key }))]} />
      </div>

      {tareas && todos.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 34 }}>🔥</div>
          <div style={{ fontWeight: 700, fontSize: 16, margin: "6px 0" }}>Empezá con uno solo</div>
          <div style={{ color: "var(--tx2)", fontSize: 13, marginBottom: 14 }}>Un hábito chico que hagas todos los días le gana a cinco que abandonás. Probá con alguno de estos:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {SUGERIDOS.map(s => (
              <button key={s} className="vh-chip" onClick={() => { setNuevo({ ...VACIO, nombre: s.slice(s.indexOf(" ") + 1) }); setNuevoAbierto(true); }}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {vista === "hoy" && habitos.length > 0 && (
        <div className="card" style={{ padding: "4px 14px" }}>
          {habitos.map(h => {
            const k = pilarKey(h.epica);
            const mapa = logsPorTarea.get(h.id) || new Map<string, string>();
            const estadoHoy = mapa.get(hoy);
            const racha = calcRacha(mapa);
            const oculto = h.mostrarEnHabitos === false, noAun = h.caracterVisibilidad === "No aún";
            return (
              <div key={h.id} className="fila" style={{ padding: "12px 0", opacity: oculto || noAun ? 0.55 : 1 }}>
                <button className={`check ${estadoHoy === "hecho" ? "on" : ""}`} style={{ width: 30, height: 30, fontSize: 14 }}
                  onClick={() => marcar(h, hoy, estadoHoy === "hecho" ? "vacio" : "hecho")} aria-label="Marcar hoy">
                  {estadoHoy === "hecho" ? "✓" : ""}
                </button>
                <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setEditId(h.id)}>
                  <div style={{ fontWeight: 600, textDecoration: estadoHoy === "hecho" ? "line-through" : "none", color: estadoHoy === "fallado" ? "var(--red-t)" : undefined }}>{h.nombre}</div>
                  <div style={{ display: "flex", gap: 3, marginTop: 5, alignItems: "center" }}>
                    {semana.map(d => {
                      const e = mapa.get(ymdLocal(d));
                      return <span key={+d} title={d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" })}
                        style={{ width: 8, height: 8, borderRadius: 2, background: e === "hecho" ? `var(--${k})` : e === "fallado" ? "var(--red)" : "var(--bd)" }} />;
                    })}
                    <span style={{ fontSize: 10, color: "var(--tx3)", marginLeft: 6 }}>{h.horario ? `${h.horario} · ` : ""}{h.frecuencia || "Diaria"}</span>
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: racha > 0 ? "var(--amb-t)" : "var(--tx3)", fontSize: 13, minWidth: 34, textAlign: "right" }}>🔥{racha}</span>
                <button onClick={() => marcar(h, hoy, estadoHoy === "fallado" ? "vacio" : "fallado")} aria-label="No lo hice hoy" title="No lo hice hoy"
                  style={{ width: 30, height: 30, padding: 0, borderRadius: 999, fontSize: 12,
                    background: estadoHoy === "fallado" ? "var(--red-b)" : "transparent", borderColor: estadoHoy === "fallado" ? "var(--red)" : "var(--bd)", color: estadoHoy === "fallado" ? "var(--red-t)" : "var(--tx3)" }}>✗</button>
              </div>
            );
          })}
        </div>
      )}

      {vista === "historial" && habitos.length > 0 && (
        <div className="card" style={{ overflowX: "auto", padding: 12 }}>
          <table style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 150, position: "sticky", left: 0, background: "var(--bg2)" }}>Hábito</th>
                {quincena.map(d => (
                  <th key={+d} style={{ textAlign: "center", padding: "6px 2px", color: ymdLocal(d) === hoy ? "var(--acc)" : undefined }}>
                    <div style={{ fontSize: 9 }}>{d.toLocaleDateString("es-AR", { weekday: "short" }).slice(0, 2)}</div>
                    <div style={{ fontSize: 11 }}>{d.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {habitos.map(h => {
                const k = pilarKey(h.epica);
                const mapa = logsPorTarea.get(h.id) || new Map<string, string>();
                return (
                  <tr key={h.id}>
                    <td style={{ position: "sticky", left: 0, background: "var(--bg2)", cursor: "pointer" }} onClick={() => setEditId(h.id)}>
                      <div style={{ fontWeight: 500 }}>{h.nombre}</div>
                      <div style={{ fontSize: 10, color: "var(--tx3)" }}>🔥{calcRacha(mapa)}</div>
                    </td>
                    {quincena.map(d => (
                      <td key={+d} style={{ textAlign: "center", padding: 2 }}>
                        <Celda estado={mapa.get(ymdLocal(d))} color={k} onClick={() => marcar(h, ymdLocal(d))} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 8 }}>Tocá una celda para corregir un día: vacío → ✓ → ✗.</div>
        </div>
      )}

      {todos.length > 0 && (
        <details className="vh-details" style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: "var(--tx3)" }}>Opciones de vista ›</summary>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={verNoAun} onChange={e => setVerNoAun(e.target.checked)} /> Mostrar los marcados como &quot;No aún&quot;</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={verOcultos} onChange={e => setVerOcultos(e.target.checked)} /> Mostrar ocultos</label>
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 6 }}>Para pausar, ocultar o borrar un hábito, tocá su nombre.</div>
        </details>
      )}

      <Sheet abierto={nuevoAbierto} onCerrar={() => setNuevoAbierto(false)} titulo="Nuevo hábito">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Campo label="¿Qué querés hacer?">
            <input type="text" autoFocus value={nuevo.nombre} placeholder="Meditar 10 min" onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })}
              onKeyDown={e => e.key === "Enter" && crear()} />
          </Campo>
          <Campo label="Pilar">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PILARES.map(p => (
                <button key={p.key} className={`vh-chip ${nuevo.epica === p.nombre ? "on" : ""}`} onClick={() => setNuevo({ ...nuevo, epica: p.nombre })}>{p.emoji} {p.short}</button>
              ))}
            </div>
          </Campo>
          <div className="vh-2">
            <Campo label="Frecuencia">
              <select value={nuevo.frecuencia} onChange={e => setNuevo({ ...nuevo, frecuencia: e.target.value })}>
                <option>Diaria</option><option>Semanal</option><option>Mensual</option>
              </select>
            </Campo>
            <Campo label="Horario (opcional)"><input type="time" value={nuevo.horario} onChange={e => setNuevo({ ...nuevo, horario: e.target.value })} /></Campo>
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)" }}>Tip: hacelo tan chico que no tengas excusa. Lo podés agrandar después.</div>
          <button className="primary" disabled={!nuevo.nombre.trim()} onClick={crear} style={{ padding: 12 }}>Crear hábito</button>
        </div>
      </Sheet>

      {editId && (
        <EditTareaModal tareaId={editId} onClose={() => setEditId(null)} onSaved={cargar}
          extra={(t: any) => (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { patch(t.id, { mostrarEnHabitos: t.mostrarEnHabitos === false }); setEditId(null); }}>
                {t.mostrarEnHabitos === false ? "👁 Volver a mostrar" : "🙈 Ocultar del seguimiento"}
              </button>
              <button onClick={() => { patch(t.id, { caracterVisibilidad: t.caracterVisibilidad === "No aún" ? "Relevante" : "No aún" }); setEditId(null); }}>
                {t.caracterVisibilidad === "No aún" ? "★ Marcar relevante" : "☆ Pausar (No aún)"}
              </button>
            </div>
          )} />
      )}
      <Toast data={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
