"use client";
import { useEffect, useState } from "react";
import { PILARES, pilarKey, PilarKey } from "@/lib/pilares";
import EditTareaModal from "@/components/EditTareaModal";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
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
function calcRacha(logs: Set<string>): number {
  let r = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Si hoy todavía no se marcó, no rompe la racha: arranca desde ayer
  if (!logs.has(ymd(d))) d.setDate(d.getDate() - 1);
  while (logs.has(ymd(d))) { r++; d.setDate(d.getDate() - 1); }
  return r;
}

const DIAS_VISIBLES = 14;

export default function Habitos() {
  const [tareas, setTareas] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [filtroPilar, setFiltroPilar] = useState<PilarKey | "todos">("todos");
  const [verNoAun, setVerNoAun] = useState(false);
  const [verOcultos, setVerOcultos] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<any>({ nombre: "", epica: "Salud", frecuencia: "Diaria", horario: "", caracterVisibilidad: "Relevante" });

  async function cargar() {
    const [t, l] = await Promise.all([
      fetch("/api/tareas").then(r => r.json()),
      fetch("/api/habitos/logs").then(r => r.json()),
    ]);
    setTareas(t); setLogs(l);
  }
  useEffect(() => { cargar(); }, []);

  const habitos = tareas
    .filter(t => t.tipo === "Hábito")
    .filter(t => filtroPilar === "todos" || pilarKey(t.epica) === filtroPilar)
    .filter(t => verNoAun || t.caracterVisibilidad !== "No aún")
    .filter(t => verOcultos || t.mostrarEnHabitos !== false);

  const dias = diasAtras(DIAS_VISIBLES);

  // index logs por tarea
  const logsPorTarea = new Map<string, Set<string>>();
  for (const l of logs) {
    if (!logsPorTarea.has(l.tareaId)) logsPorTarea.set(l.tareaId, new Set());
    logsPorTarea.get(l.tareaId)!.add(l.fecha);
  }

  async function toggle(tareaId: string, fecha: string) {
    // Optimista
    const set = logsPorTarea.get(tareaId) || new Set();
    if (set.has(fecha)) {
      setLogs(prev => prev.filter(l => !(l.tareaId === tareaId && l.fecha === fecha)));
    } else {
      setLogs(prev => [...prev, { id: "tmp" + Math.random(), tareaId, fecha }]);
    }
    await fetch("/api/habitos/toggle", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tareaId, fecha }),
    });
    cargar();
  }

  async function setVisible(id: string, mostrar: boolean) {
    await fetch(`/api/tareas/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mostrarEnHabitos: mostrar }),
    });
    cargar();
  }

  async function setCaracter(id: string, caracter: string) {
    await fetch(`/api/tareas/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ caracterVisibilidad: caracter }),
    });
    cargar();
  }

  async function crearHabito() {
    if (!nuevo.nombre.trim()) return;
    await fetch("/api/tareas", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...nuevo, tipo: "Hábito" }),
    });
    setNuevo({ nombre: "", epica: "Salud", frecuencia: "Diaria", horario: "", caracterVisibilidad: "Relevante" });
    setShowForm(false);
    cargar();
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar hábito y todos sus registros?")) return;
    await fetch(`/api/tareas/${id}`, { method: "DELETE" });
    cargar();
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Hábitos</h1>
      <p style={{ color: "var(--tx3)", marginBottom: 12, fontSize: 12 }}>
        Click en cualquier celda para marcar/desmarcar. Últimos {DIAS_VISIBLES} días.
      </p>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button className={filtroPilar === "todos" ? "primary" : ""} onClick={() => setFiltroPilar("todos")}>Todos</button>
        {PILARES.map(p => (
          <button key={p.key}
            className={filtroPilar === p.key ? "primary" : ""}
            onClick={() => setFiltroPilar(p.key)}
            style={{ borderLeft: `3px solid var(--${p.key})` }}>
            {p.emoji} {p.nombre}
          </button>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
          <input type="checkbox" checked={verNoAun} onChange={e => setVerNoAun(e.target.checked)} />
          Mostrar "No aún"
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
          <input type="checkbox" checked={verOcultos} onChange={e => setVerOcultos(e.target.checked)} />
          Mostrar ocultos
        </label>
        <button className="primary" style={{ marginLeft: "auto" }} onClick={() => setShowForm(!showForm)}>+ Hábito</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Nuevo hábito</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--tx3)" }}>Nombre</div>
              <input type="text" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Meditar" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--tx3)" }}>Pilar (épica)</div>
              <select value={nuevo.epica} onChange={e => setNuevo({ ...nuevo, epica: e.target.value })}>
                {PILARES.map(p => <option key={p.key}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--tx3)" }}>Frecuencia</div>
              <select value={nuevo.frecuencia} onChange={e => setNuevo({ ...nuevo, frecuencia: e.target.value })}>
                <option>Diaria</option><option>Semanal</option><option>Mensual</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--tx3)" }}>Horario</div>
              <input type="text" value={nuevo.horario} onChange={e => setNuevo({ ...nuevo, horario: e.target.value })} placeholder="07:00" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--tx3)" }}>Visibilidad</div>
              <select value={nuevo.caracterVisibilidad} onChange={e => setNuevo({ ...nuevo, caracterVisibilidad: e.target.value })}>
                <option>Relevante</option><option>No aún</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="primary" onClick={crearHabito}>Crear</button>
            <button onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Grilla */}
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Hábito</th>
              <th style={{ textAlign: "center" }}>Racha</th>
              {dias.map(d => (
                <th key={ymd(d)} style={{ textAlign: "center", minWidth: 32, padding: "8px 4px" }}>
                  <div style={{ fontSize: 9 }}>{d.toLocaleDateString("es-AR", { weekday: "short" }).slice(0, 2)}</div>
                  <div style={{ fontSize: 11, color: "var(--tx2)" }}>{d.getDate()}</div>
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {habitos.map(h => {
              const k = pilarKey(h.epica);
              const set = logsPorTarea.get(h.id) || new Set();
              const racha = calcRacha(set);
              const noAun = h.caracterVisibilidad === "No aún";
              return (
                <tr key={h.id} style={{ opacity: noAun ? 0.55 : 1 }}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => setCaracter(h.id, noAun ? "Relevante" : "No aún")}
                        title={noAun ? "Marcar relevante" : "Marcar no aún"}
                        style={{ padding: "0 4px", fontSize: 14, background: "transparent", border: "none", color: noAun ? "var(--tx3)" : "var(--acc)" }}>
                        {noAun ? "☆" : "★"}
                      </button>
                      <div style={{ width: 6, height: 6, borderRadius: 999, background: `var(--${k})` }} />
                      <div onClick={() => setEditId(h.id)} style={{ cursor: "pointer" }}>
                        <div style={{ fontWeight: 500 }}>{h.nombre}</div>
                        <div style={{ fontSize: 10, color: "var(--tx3)" }}>{h.epica} · {h.frecuencia}{h.horario ? ` · ${h.horario}` : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ fontWeight: 700, color: racha > 0 ? `var(--${k}-t)` : "var(--tx3)" }}>{racha}d</span>
                  </td>
                  {dias.map(d => {
                    const fecha = ymd(d);
                    const hecho = set.has(fecha);
                    return (
                      <td key={fecha} style={{ textAlign: "center", padding: 2 }}>
                        <button
                          onClick={() => toggle(h.id, fecha)}
                          style={{
                            width: 24, height: 24, padding: 0, borderRadius: 4,
                            background: hecho ? `var(--${k})` : "var(--bg3)",
                            border: `1px solid ${hecho ? `var(--${k})` : "var(--bd)"}`,
                            color: hecho ? "#000" : "var(--tx3)",
                            fontSize: 12, fontWeight: 700,
                          }}>{hecho ? "✓" : ""}</button>
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => setVisible(h.id, h.mostrarEnHabitos === false)}
                      title={h.mostrarEnHabitos === false ? "Mostrar en tracking" : "Ocultar del tracking"}
                      style={{ padding: "2px 8px", fontSize: 12, marginRight: 4 }}>
                      {h.mostrarEnHabitos === false ? "👁" : "🚫"}
                    </button>
                    <button onClick={() => borrar(h.id)} style={{ padding: "2px 8px", fontSize: 11, color: "var(--red-t)" }}>×</button>
                  </td>
                </tr>
              );
            })}
            {habitos.length === 0 && (
              <tr><td colSpan={dias.length + 3} style={{ textAlign: "center", color: "var(--tx3)" }}>Sin hábitos para los filtros actuales</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editId && <EditTareaModal tareaId={editId} onClose={() => setEditId(null)} onSaved={cargar} />}
    </div>
  );
}
