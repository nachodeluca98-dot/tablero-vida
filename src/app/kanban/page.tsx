"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PILARES, pilarKey, PilarKey } from "@/lib/pilares";
import EditTareaModal from "@/components/EditTareaModal";

export default function KanbanPage() {
  return <Suspense fallback={<div>Cargando...</div>}><Kanban /></Suspense>;
}

const COLUMNAS_DEFAULT = ["Sin empezar", "Agendada", "En progreso", "Completada", "Más tarde"];
const COLUMNAS_CRE = ["Borrador", "Pend. enviar", "En edición", "Pend. revisar", "En corrección", "Listo", "Subido"];
const COLUMNAS_SOC = ["Agendada", "Recurrente", "Later", "Completada"];

function columnasDe(pilar: PilarKey | "todos"): string[] {
  if (pilar === "cre") return COLUMNAS_CRE;
  if (pilar === "soc") return COLUMNAS_SOC;
  return COLUMNAS_DEFAULT;
}

function normEstadoEn(e: string | undefined, cols: string[]) {
  if (!e) return cols[0];
  // match exacto case-insensitive
  const m = cols.find(c => c.toLowerCase() === e.toLowerCase());
  if (m) return m;
  const l = e.toLowerCase();
  // fallbacks default
  if (cols === COLUMNAS_DEFAULT) {
    if (l.includes("agend")) return "Agendada";
    if (l.includes("progreso")) return "En progreso";
    if (l.includes("complet") || l.includes("hecho")) return "Completada";
    if (l.includes("tarde") || l.includes("backlog") || l.includes("later")) return "Más tarde";
    return "Sin empezar";
  }
  if (cols === COLUMNAS_SOC) {
    if (l.includes("agend")) return "Agendada";
    if (l.includes("recurr")) return "Recurrente";
    if (l.includes("later") || l.includes("tarde")) return "Later";
    if (l.includes("complet")) return "Completada";
    return "Agendada";
  }
  // CRE
  if (l.includes("borrad")) return "Borrador";
  if (l.includes("envi")) return "Pend. enviar";
  if (l.includes("edici")) return "En edición";
  if (l.includes("revis")) return "Pend. revisar";
  if (l.includes("correc")) return "En corrección";
  if (l.includes("listo")) return "Listo";
  if (l.includes("subid")) return "Subido";
  return cols[0];
}

function esRecurrente(t: any) {
  if (t.tipo === "Hábito") return true;
  if (!t.frecuencia) return false;
  const f = String(t.frecuencia).toLowerCase();
  if (f === "" || f === "puntual" || f === "una vez" || f === "única") return false;
  return true;
}

function venceInfo(fecha?: string | null) {
  if (!fecha) return { txt: "sin fecha", color: "tx3", bg: "var(--bg3)" };
  const d = Math.ceil((+new Date(fecha) - Date.now()) / 86400000);
  const fmt = new Date(fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  if (d < 0) return { txt: `${fmt} · vencido`, color: "red-t", bg: "var(--red-b)" };
  if (d === 0) return { txt: `${fmt} · hoy`, color: "red-t", bg: "var(--red-b)" };
  if (d === 1) return { txt: `${fmt} · mañana`, color: "red-t", bg: "var(--red-b)" };
  if (d <= 7) return { txt: `${fmt} · ${d}d`, color: "amb-t", bg: "var(--amb-b)" };
  return { txt: fmt, color: "tx2", bg: "var(--bg3)" };
}

function Kanban() {
  const sp = useSearchParams();
  const [tareas, setTareas] = useState<any[]>([]);
  const [drag, setDrag] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ col: string; index: number } | null>(null);
  const [filtroPilar, setFiltroPilar] = useState<PilarKey | "todos">("todos");
  const [filtroRec, setFiltroRec] = useState<"todos" | "puntual" | "recurrente">("todos");
  const [filtroSub, setFiltroSub] = useState<string | "todos">("todos");
  const [verNoAun, setVerNoAun] = useState(false);
  const [quickAdd, setQuickAdd] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [colWidth, setColWidth] = useState(280); // zoom: px por columna en desktop
  const [nueva, setNueva] = useState<any>({
    nombre: "", epica: "Profesional", tipo: "Tarea", estado: "Sin empezar",
    prioridad: "Media", caracterVisibilidad: "Relevante",
    fechaVencimiento: "", duracionMin: "", notas: "",
  });

  useEffect(() => {
    const p = sp.get("pilar") as PilarKey | null;
    if (p) setFiltroPilar(p);
  }, [sp]);

  async function cargar() {
    const t = await fetch("/api/tareas").then(r => r.json());
    setTareas(t);
  }
  useEffect(() => { cargar(); }, []);

  const COLUMNAS = columnasDe(filtroPilar);

  const tareasFiltradas = tareas.filter(t => {
    if (filtroPilar !== "todos" && pilarKey(t.epica) !== filtroPilar) return false;
    if (!verNoAun && t.caracterVisibilidad === "No aún") return false;
    if (filtroRec === "puntual" && esRecurrente(t)) return false;
    if (filtroRec === "recurrente" && !esRecurrente(t)) return false;
    if (filtroPilar === "ges" && filtroSub !== "todos" && (t.subepica || "") !== filtroSub) return false;
    return true;
  });

  function itemsDe(col: string) {
    return tareasFiltradas
      .filter(t => normEstadoEn(t.estado, COLUMNAS) === col)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || +new Date(a.createdAt) - +new Date(b.createdAt));
  }

  async function onDrop(col: string, index: number) {
    if (!drag) return;
    const dest = itemsDe(col).filter(t => t.id !== drag);
    const dragged = tareas.find(t => t.id === drag);
    if (!dragged) return;
    dest.splice(index, 0, dragged);
    const ids = dest.map(t => t.id);

    setTareas(prev => prev.map(t => {
      const idx = ids.indexOf(t.id);
      if (idx === -1) return t;
      return { ...t, estado: col, orden: idx };
    }));

    setDrag(null); setDragOver(null);

    await fetch("/api/tareas/reorder", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ estado: col, ids }),
    });
    cargar();
  }

  async function crearRapida(col: string) {
    const nombre = (quickAdd[col] || "").trim();
    if (!nombre) return;
    // Si hay un filtro de pilar activo, lo usa como épica por defecto
    const epica = filtroPilar === "todos" ? "Meta-sistema" : PILARES.find(p => p.key === filtroPilar)?.nombre || "";
    await fetch("/api/tareas", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre,
        estado: col,
        epica,
        tipo: "Tarea",
        caracterVisibilidad: "Relevante",
        prioridad: "Media",
      }),
    });
    setQuickAdd(prev => ({ ...prev, [col]: "" }));
    cargar();
  }

  async function crearCompleta() {
    if (!nueva.nombre.trim()) return;
    const data: any = { ...nueva };
    if (!data.fechaVencimiento) delete data.fechaVencimiento;
    else data.fechaVencimiento = new Date(data.fechaVencimiento).toISOString();
    if (data.duracionMin) data.duracionMin = Number(data.duracionMin); else delete data.duracionMin;
    await fetch("/api/tareas", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    setNueva({ nombre: "", epica: "Profesional", tipo: "Tarea", estado: "Sin empezar", prioridad: "Media", caracterVisibilidad: "Relevante", fechaVencimiento: "", duracionMin: "", notas: "" });
    setShowFull(false);
    cargar();
  }

  async function borrarTarea(id: string) {
    if (!confirm("¿Borrar tarea?")) return;
    await fetch(`/api/tareas/${id}`, { method: "DELETE" });
    cargar();
  }

  async function setCaracter(id: string, caracter: string) {
    await fetch(`/api/tareas/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ caracterVisibilidad: caracter }),
    });
    cargar();
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Kanban</h1>
      <p style={{ color: "var(--tx3)", marginBottom: 12, fontSize: 12 }}>
        Arrastrá entre columnas o reordená dentro. Click en ★/☆ cambia carácter de visibilidad.
      </p>

      {/* Filtros de pilar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className={filtroPilar === "todos" ? "primary" : ""} onClick={() => setFiltroPilar("todos")}>Todos</button>
        {PILARES.map(p => (
          <button key={p.key}
            className={filtroPilar === p.key ? "primary" : ""}
            onClick={() => setFiltroPilar(p.key)}
            style={{ borderLeft: `3px solid var(--${p.key})` }}>
            {p.emoji} {p.nombre}
          </button>
        ))}
      </div>

      {/* Subfiltro Capitalist (solo Gestión Adulta) */}
      {filtroPilar === "ges" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--tx3)" }}>Sub-épica:</span>
          <button className={filtroSub === "todos" ? "primary" : ""} onClick={() => setFiltroSub("todos")} style={{ fontSize: 11, padding: "3px 10px" }}>Todas</button>
          <button className={filtroSub === "Capitalist" ? "primary" : ""} onClick={() => setFiltroSub("Capitalist")} style={{ fontSize: 11, padding: "3px 10px" }}>💰 Capitalist</button>
        </div>
      )}

      {/* Filtros de recurrencia + zoom + toggles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, background: "var(--bg2)", padding: 3, borderRadius: 6, border: "1px solid var(--bd)" }}>
          {[
            { k: "todos", l: "Todas" },
            { k: "puntual", l: "⚡ Puntuales" },
            { k: "recurrente", l: "🔁 Recurrentes" },
          ].map(o => (
            <button key={o.k}
              onClick={() => setFiltroRec(o.k as any)}
              className={filtroRec === o.k ? "primary" : ""}
              style={{ fontSize: 11, padding: "3px 10px" }}>
              {o.l}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, color: "var(--tx3)" }}>
          Zoom:
          <button onClick={() => setColWidth(w => Math.max(180, w - 40))} style={{ padding: "3px 8px", fontSize: 12 }}>−</button>
          <button onClick={() => setColWidth(w => Math.min(500, w + 40))} style={{ padding: "3px 8px", fontSize: 12 }}>+</button>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={verNoAun} onChange={e => setVerNoAun(e.target.checked)} />
            Mostrar "No aún"
          </label>
          <button className="primary" onClick={() => setShowFull(!showFull)}>+ Tarea detallada</button>
        </div>
      </div>

      {showFull && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Nueva tarea</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Nombre</div>
              <input type="text" value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })} /></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Pilar (épica)</div>
              <select value={nueva.epica} onChange={e => setNueva({ ...nueva, epica: e.target.value })}>
                {PILARES.map(p => <option key={p.key}>{p.nombre}</option>)}
              </select></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Tipo</div>
              <select value={nueva.tipo} onChange={e => setNueva({ ...nueva, tipo: e.target.value })}>
                <option>Tarea</option><option>Hábito</option><option>Vencimiento</option><option>Proyecto</option>
              </select></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Estado</div>
              <select value={nueva.estado} onChange={e => setNueva({ ...nueva, estado: e.target.value })}>
                {COLUMNAS.map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Prioridad</div>
              <select value={nueva.prioridad} onChange={e => setNueva({ ...nueva, prioridad: e.target.value })}>
                <option>Crítica</option><option>Alta</option><option>Media</option><option>Baja</option>
              </select></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Visibilidad</div>
              <select value={nueva.caracterVisibilidad} onChange={e => setNueva({ ...nueva, caracterVisibilidad: e.target.value })}>
                <option>Relevante</option><option>No aún</option>
              </select></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Fecha vencimiento</div>
              <input type="date" value={nueva.fechaVencimiento} onChange={e => setNueva({ ...nueva, fechaVencimiento: e.target.value })} /></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Duración (min)</div>
              <input type="number" value={nueva.duracionMin} onChange={e => setNueva({ ...nueva, duracionMin: e.target.value })} /></div>
            <div style={{ gridColumn: "span 4" }}><div style={{ fontSize: 10, color: "var(--tx3)" }}>Notas</div>
              <input type="text" value={nueva.notas} onChange={e => setNueva({ ...nueva, notas: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="primary" onClick={crearCompleta}>Crear</button>
            <button onClick={() => setShowFull(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="kanban-scroll">
        <div className="kanban-board">
          {COLUMNAS.map(col => {
            const items = itemsDe(col);
            const puntuales = items.filter(t => !esRecurrente(t));
            const recurrentes = items.filter(t => esRecurrente(t));
            const renderCard = (t: any, i: number) => {
                  const k = pilarKey(t.epica);
                  const showBar = dragOver?.col === col && dragOver.index === i && drag !== t.id;
                  // (card render)
                  const v = venceInfo(t.fechaVencimiento);
                  const noAun = t.caracterVisibilidad === "No aún";
                  const rec = esRecurrente(t);
                  return (
                    <div key={t.id}>
                      {showBar && <div style={{ height: 2, background: "var(--acc)", borderRadius: 2, marginBottom: 6 }} />}
                      <div
                        draggable
                        onDragStart={() => setDrag(t.id)}
                        onDragEnd={() => { setDrag(null); setDragOver(null); }}
                        onDragOver={e => {
                          e.preventDefault(); e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const before = e.clientY < rect.top + rect.height / 2;
                          setDragOver({ col, index: before ? i : i + 1 });
                        }}
                        onDrop={e => { e.stopPropagation(); onDrop(col, dragOver?.col === col ? dragOver.index : i); }}
                        style={{
                          background: "var(--bg3)",
                          border: "1px solid var(--bd)",
                          borderLeft: `3px solid var(--${k})`,
                          borderRadius: 6,
                          padding: 8,
                          marginBottom: 6,
                          cursor: "grab",
                          opacity: drag === t.id ? 0.4 : (noAun ? 0.6 : 1),
                        }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
                          <button
                            onClick={() => setCaracter(t.id, noAun ? "Relevante" : "No aún")}
                            title={noAun ? "Marcar relevante" : "Marcar no aún"}
                            style={{ padding: "0 4px", fontSize: 14, background: "transparent", border: "none", color: noAun ? "var(--tx3)" : "var(--acc)" }}>
                            {noAun ? "☆" : "★"}
                          </button>
                          <div style={{ fontSize: 12, flex: 1, cursor: "pointer" }} onClick={() => setEditId(t.id)}>
                            {t.nombre}
                            <span className={`recurr-badge ${rec ? "rec" : "pun"}`}>{rec ? "🔁" : "⚡"}</span>
                          </div>
                          <button onClick={() => borrarTarea(t.id)} title="Borrar"
                            style={{ padding: "0 4px", fontSize: 12, background: "transparent", border: "none", color: "var(--tx3)" }}>×</button>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                          {t.epica && <span className="tag" style={{ background: `var(--${k}-b)`, color: `var(--${k}-t)` }}>{t.epica}</span>}
                          <span className="tag" style={{ background: v.bg, color: `var(--${v.color})` }}>{v.txt}</span>
                        </div>
                      </div>
                    </div>
                  );
            };
            return (
              <div key={col} className="kanban-col"
                onDragOver={e => { e.preventDefault(); setDragOver({ col, index: items.length }); }}
                onDrop={() => onDrop(col, dragOver?.col === col ? dragOver.index : items.length)}
                style={{ width: colWidth, minWidth: colWidth, background: "var(--bg2)", border: "1px solid var(--bd)", borderRadius: 10, padding: 10, minHeight: 400 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px 10px" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tx3)", fontWeight: 600 }}>{col}</div>
                  <div style={{ fontSize: 11, color: "var(--tx3)" }}>{items.length}</div>
                </div>

                {/* Subseccion: Puntuales arriba */}
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--pro-t)", padding: "2px 4px", marginBottom: 4, fontWeight: 700 }}>⚡ Puntuales ({puntuales.length})</div>
                {puntuales.map((t, i) => renderCard(t, i))}

                {/* Subseccion: Recurrentes abajo */}
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--apr-t)", padding: "8px 4px 2px", marginTop: 6, borderTop: "1px dashed var(--bd)", fontWeight: 700 }}>🔁 Recurrentes ({recurrentes.length})</div>
                {recurrentes.map((t, i) => renderCard(t, puntuales.length + i))}

                {dragOver?.col === col && dragOver.index === items.length && drag && (
                  <div style={{ height: 2, background: "var(--acc)", borderRadius: 2 }} />
                )}

                {/* Quick add */}
                <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                  <input
                    type="text"
                    value={quickAdd[col] || ""}
                    onChange={e => setQuickAdd(prev => ({ ...prev, [col]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && crearRapida(col)}
                    placeholder={filtroPilar !== "todos" ? `+ Nueva ${PILARES.find(p => p.key === filtroPilar)?.emoji}...` : "+ Tarea rápida..."}
                    style={{ fontSize: 11, padding: "4px 8px" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editId && <EditTareaModal tareaId={editId} onClose={() => setEditId(null)} onSaved={cargar} />}
    </div>
  );
}
