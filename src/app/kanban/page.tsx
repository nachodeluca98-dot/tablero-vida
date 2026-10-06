"use client";
import { Suspense, useEffect, useState } from "react";
import { esRecurrente, venceInfo } from "@/lib/tareas";
import { Campo, Chips, PageHeader, Sheet, TipBanner, Toast, type ToastData, api, guardarLocal, leerLocal } from "@/components/ui";
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

const NUEVA_VACIA = { nombre: "", epica: "", estado: "", prioridad: "Media", fechaVencimiento: "", notas: "", recurrente: false, frecuencia: "Semanal" };

function columnaHecha(cols: string[]) {
  return cols.find(c => /complet|subido/i.test(c)) ?? cols[cols.length - 1];
}

function Kanban() {
  const sp = useSearchParams();
  const [tareas, setTareas] = useState<any[] | null>(null);
  const [vista, setVista] = useState<"lista" | "tablero">("lista");
  const [drag, setDrag] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ col: string; index: number } | null>(null);
  const [filtroPilar, setFiltroPilar] = useState<PilarKey | "todos">("todos");
  const [filtroRec, setFiltroRec] = useState<"todos" | "puntual" | "recurrente">("todos");
  const [filtroSub, setFiltroSub] = useState<string | "todos">("todos");
  const [verNoAun, setVerNoAun] = useState(false);
  const [verHabitos, setVerHabitos] = useState(false);
  const [quickAdd, setQuickAdd] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [nueva, setNueva] = useState<any>(NUEVA_VACIA);
  const [colWidth, setColWidth] = useState(280);
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    const p = sp.get("pilar") as PilarKey | null;
    if (p) setFiltroPilar(p);
  }, [sp]);

  async function cargar() {
    setTareas(await api("/api/tareas"));
  }
  useEffect(() => {
    cargar();
    const v = leerLocal("tareas-vista");
    if (v === "lista" || v === "tablero") setVista(v);
    else setVista(window.innerWidth > 900 ? "tablero" : "lista");
  }, []);

  const COLUMNAS = columnasDe(filtroPilar);
  const HECHA = columnaHecha(COLUMNAS);
  const pilarNombre = filtroPilar === "todos" ? "Meta-sistema" : PILARES.find(p => p.key === filtroPilar)?.nombre || "";

  const tareasFiltradas = (tareas ?? []).filter(t => {
    if (!verHabitos && t.tipo === "Hábito") return false;
    if (filtroPilar !== "todos" && pilarKey(t.epica) !== filtroPilar) return false;
    if (!verNoAun && t.caracterVisibilidad === "No aún") return false;
    if (filtroRec === "puntual" && esRecurrente(t)) return false;
    if (filtroRec === "recurrente" && !esRecurrente(t)) return false;
    if (filtroPilar === "ges" && filtroSub !== "todos" && (t.subepica || "") !== filtroSub) return false;
    return true;
  });

  function itemsDe(col: string, modo?: "puntual" | "recurrente") {
    return tareasFiltradas
      .filter(t => normEstadoEn(t.estado, COLUMNAS) === col)
      .filter(t => !modo || (modo === "recurrente" ? esRecurrente(t) : !esRecurrente(t)))
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || +new Date(a.createdAt) - +new Date(b.createdAt));
  }

  async function onDrop(col: string, index: number) {
    if (!drag || !tareas) return;
    const dest = itemsDe(col).filter(t => t.id !== drag);
    const dragged = tareas.find(t => t.id === drag);
    if (!dragged) return;
    dest.splice(index, 0, dragged);
    const ids = dest.map(t => t.id);
    setTareas(prev => (prev ?? []).map(t => {
      const idx = ids.indexOf(t.id);
      return idx === -1 ? t : { ...t, estado: col, orden: idx };
    }));
    setDrag(null); setDragOver(null);
    await api("/api/tareas/reorder", "POST", { estado: col, ids });
    cargar();
  }

  async function mover(t: any, col: string, avisar = true) {
    const previo = t.estado;
    setTareas(prev => (prev ?? []).map(x => (x.id === t.id ? { ...x, estado: col } : x)));
    await api(`/api/tareas/${t.id}`, "PATCH", { estado: col });
    if (avisar) {
      setToast({
        titulo: col === HECHA ? "✓ Completada" : `Movida a ${col}`, lineas: [t.nombre],
        deshacer: async () => { await api(`/api/tareas/${t.id}`, "PATCH", { estado: previo }); cargar(); },
      });
    }
  }

  async function crearRapida(col: string) {
    const nombre = (quickAdd[col] || "").trim();
    if (!nombre) return;
    setQuickAdd(prev => ({ ...prev, [col]: "" }));
    await api("/api/tareas", "POST", { nombre, estado: col, epica: pilarNombre, tipo: "Tarea", caracterVisibilidad: "Relevante", prioridad: "Media" });
    cargar();
  }

  async function crearCompleta() {
    if (!nueva.nombre.trim()) return;
    const data: any = {
      nombre: nueva.nombre.trim(),
      epica: nueva.epica || pilarNombre,
      estado: nueva.estado || COLUMNAS[0],
      prioridad: nueva.prioridad,
      notas: nueva.notas || null,
      tipo: "Tarea",
      caracterVisibilidad: "Relevante",
      frecuencia: nueva.recurrente ? nueva.frecuencia : "Puntual",
    };
    if (nueva.fechaVencimiento) data.fechaVencimiento = new Date(`${nueva.fechaVencimiento}T12:00:00`).toISOString();
    await api("/api/tareas", "POST", data);
    setNueva(NUEVA_VACIA);
    setNuevaAbierta(false);
    setToast({ titulo: "✓ Tarea creada", lineas: [data.nombre] });
    cargar();
  }

  const cambiarVista = (v: "lista" | "tablero") => { setVista(v); guardarLocal("tareas-vista", v); };
  const pilaresConTareas = PILARES.filter(p => (tareas ?? []).some(t => pilarKey(t.epica) === p.key));

  const Fila = ({ t }: { t: any }) => {
    const k = pilarKey(t.epica);
    const v = venceInfo(t.fechaVencimiento);
    const col = normEstadoEn(t.estado, COLUMNAS);
    const hecha = col === HECHA;
    return (
      <div className="fila" style={{ opacity: t.caracterVisibilidad === "No aún" ? 0.6 : 1 }}>
        <button className={`check ${hecha ? "on" : ""}`} onClick={() => mover(t, hecha ? COLUMNAS[0] : HECHA)} aria-label={hecha ? "Reabrir" : "Completar"}>{hecha ? "✓" : ""}</button>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setEditId(t.id)}>
          <div style={{ textDecoration: hecha ? "line-through" : "none", color: hecha ? "var(--tx3)" : undefined }}>{t.nombre}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
            {filtroPilar === "todos" && <span className="tag" style={{ background: `var(--${k}-b)`, color: `var(--${k}-t)`, textTransform: "none" }}>{PILARES.find(p => p.key === k)?.emoji} {PILARES.find(p => p.key === k)?.short}</span>}
            {t.fechaVencimiento && !hecha && <span className="tag" style={{ background: v.bg, color: `var(--${v.color})`, textTransform: "none" }}>{v.txt}</span>}
            {esRecurrente(t) && <span className="tag" style={{ background: "var(--apr-b)", color: "var(--apr-t)", textTransform: "none" }}>🔁 {t.frecuencia}</span>}
            {(t.prioridad === "Crítica" || t.prioridad === "Alta") && <span className="tag" style={{ background: "var(--red-b)", color: "var(--red-t)", textTransform: "none" }}>{t.prioridad}</span>}
          </div>
        </div>
        <select value={col} onChange={e => mover(t, e.target.value)} aria-label="Mover a"
          style={{ width: "auto", maxWidth: 110, fontSize: 11, padding: "4px 6px", color: "var(--tx2)" }}>
          {COLUMNAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    );
  };

  return (
    <div>
      <PageHeader titulo="Tareas" sub={tareas ? `${tareasFiltradas.filter(t => normEstadoEn(t.estado, COLUMNAS) !== HECHA).length} abiertas` : undefined}>
        <button className="primary" onClick={() => { setNueva({ ...NUEVA_VACIA, epica: pilarNombre, estado: COLUMNAS[0] }); setNuevaAbierta(true); }}>+ Tarea</button>
      </PageHeader>

      <TipBanner id="tareas-1">
        Tildá el círculo para completar y usá el selector de la derecha para mover de columna. En la compu, la vista <b>Tablero</b> te deja arrastrar.
      </TipBanner>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        {(["lista", "tablero"] as const).map(v => (
          <button key={v} className={`vh-tab ${vista === v ? "on" : ""}`} onClick={() => cambiarVista(v)}>{v === "lista" ? "☰ Lista" : "▦ Tablero"}</button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <Chips valor={filtroRec} onChange={setFiltroRec} opciones={[
            { key: "todos" as const, label: "Todas" }, { key: "puntual" as const, label: "⚡ Una vez" }, { key: "recurrente" as const, label: "🔁 Se repiten" },
          ]} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <Chips valor={filtroPilar} onChange={v => { setFiltroPilar(v); setFiltroSub("todos"); }}
          opciones={[{ key: "todos" as const, label: "Todos" }, ...pilaresConTareas.map(p => ({ key: p.key, label: `${p.emoji} ${p.short}`, color: p.key }))]} />
      </div>
      {filtroPilar === "ges" && (
        <div style={{ marginBottom: 10 }}>
          <Chips valor={filtroSub} onChange={setFiltroSub} opciones={[{ key: "todos", label: "Todas" }, { key: "Capitalist", label: "💰 Capitalist" }]} />
        </div>
      )}

      {vista === "lista" && tareas && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card" style={{ padding: 10 }}>
            <input type="text" value={quickAdd[COLUMNAS[0]] || ""} placeholder={`+ Agregar en "${COLUMNAS[0]}"${filtroPilar !== "todos" ? ` (${PILARES.find(p => p.key === filtroPilar)?.short})` : ""} y Enter`}
              onChange={e => setQuickAdd(prev => ({ ...prev, [COLUMNAS[0]]: e.target.value }))} onKeyDown={e => e.key === "Enter" && crearRapida(COLUMNAS[0])} />
          </div>
          {COLUMNAS.filter(c => c !== HECHA).map(col => {
            const items = itemsDe(col);
            if (!items.length) return null;
            return (
              <div key={col}>
                <div className="seccion-titulo"><span>{col}</span><span>{items.length}</span></div>
                <div className="card" style={{ padding: "2px 12px" }}>{items.map(t => <Fila key={t.id} t={t} />)}</div>
              </div>
            );
          })}
          {tareasFiltradas.length === 0 && (
            <div className="card" style={{ color: "var(--tx3)", textAlign: "center", padding: 20 }}>No hay tareas con estos filtros. Agregá una arriba.</div>
          )}
          {itemsDe(HECHA).length > 0 && (
            <details className="vh-details">
              <summary className="seccion-titulo"><span>{HECHA} ({itemsDe(HECHA).length})</span><span>›</span></summary>
              <div className="card" style={{ padding: "2px 12px" }}>{itemsDe(HECHA).slice(0, 30).map(t => <Fila key={t.id} t={t} />)}</div>
            </details>
          )}
        </div>
      )}

      {vista === "tablero" && (
        <>
          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, color: "var(--tx3)", marginBottom: 10 }}>
            Ancho de columnas:
            <button onClick={() => setColWidth(w => Math.max(180, w - 40))} style={{ padding: "3px 8px", fontSize: 12 }}>−</button>
            <button onClick={() => setColWidth(w => Math.min(500, w + 40))} style={{ padding: "3px 8px", fontSize: 12 }}>+</button>
          </div>
          {(filtroRec === "todos" ? (["puntual", "recurrente"] as const) : [filtroRec]).map(modo => (
            <div key={modo} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: modo === "puntual" ? "var(--pro-t)" : "var(--apr-t)" }}>
                {modo === "puntual" ? "⚡ Una vez" : "🔁 Se repiten"}
              </div>
              <div className="kanban-scroll">
                <div className="kanban-board">
                  {COLUMNAS.map(col => {
                    const items = itemsDe(col, modo);
                    return (
                      <div key={col} className="kanban-col"
                        onDragOver={e => { e.preventDefault(); setDragOver({ col, index: items.length }); }}
                        onDrop={() => onDrop(col, dragOver?.col === col ? dragOver.index : items.length)}
                        style={{ width: colWidth, minWidth: colWidth, background: "var(--bg2)", border: "1px solid var(--bd)", borderRadius: 10, padding: 10, minHeight: 200 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px 10px" }}>
                          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tx3)", fontWeight: 600 }}>{col}</div>
                          <div style={{ fontSize: 11, color: "var(--tx3)" }}>{items.length}</div>
                        </div>
                        {items.map((t, i) => {
                          const k = pilarKey(t.epica);
                          const showBar = dragOver?.col === col && dragOver.index === i && drag !== t.id;
                          const v = venceInfo(t.fechaVencimiento);
                          const noAun = t.caracterVisibilidad === "No aún";
                          return (
                            <div key={t.id}>
                              {showBar && <div style={{ height: 2, background: "var(--acc)", borderRadius: 2, marginBottom: 6 }} />}
                              <div draggable
                                onDragStart={() => setDrag(t.id)}
                                onDragEnd={() => { setDrag(null); setDragOver(null); }}
                                onDragOver={e => {
                                  e.preventDefault(); e.stopPropagation();
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  setDragOver({ col, index: e.clientY < rect.top + rect.height / 2 ? i : i + 1 });
                                }}
                                onDrop={e => { e.stopPropagation(); onDrop(col, dragOver?.col === col ? dragOver.index : i); }}
                                onClick={() => setEditId(t.id)}
                                style={{ background: "var(--bg3)", border: "1px solid var(--bd)", borderLeft: `3px solid var(--${k})`, borderRadius: 6, padding: 8, marginBottom: 6, cursor: "grab", opacity: drag === t.id ? 0.4 : noAun ? 0.6 : 1 }}>
                                <div style={{ fontSize: 12, marginBottom: 6 }}>{t.nombre}</div>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {t.epica && <span className="tag" style={{ background: `var(--${k}-b)`, color: `var(--${k}-t)` }}>{t.epica}</span>}
                                  {t.fechaVencimiento && <span className="tag" style={{ background: v.bg, color: `var(--${v.color})`, textTransform: "none" }}>{v.txt}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {dragOver?.col === col && dragOver.index === items.length && drag && <div style={{ height: 2, background: "var(--acc)", borderRadius: 2 }} />}
                        <input type="text" value={quickAdd[col] || ""} placeholder="+ Agregar..." style={{ fontSize: 11, padding: "4px 8px", marginTop: 8 }}
                          onChange={e => setQuickAdd(prev => ({ ...prev, [col]: e.target.value }))} onKeyDown={e => e.key === "Enter" && crearRapida(col)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <details className="vh-details" style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 12, color: "var(--tx3)" }}>Opciones de vista ›</summary>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginTop: 8 }}>
          <input type="checkbox" checked={verNoAun} onChange={e => setVerNoAun(e.target.checked)} /> Mostrar tareas en pausa (&quot;No aún&quot;)
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginTop: 6 }}>
          <input type="checkbox" checked={verHabitos} onChange={e => setVerHabitos(e.target.checked)} /> Mostrar hábitos (se manejan en la pantalla Hábitos)
        </label>
      </details>

      <Sheet abierto={nuevaAbierta} onCerrar={() => setNuevaAbierta(false)} titulo="Nueva tarea">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Campo label="¿Qué hay que hacer?">
            <input type="text" autoFocus value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })} onKeyDown={e => e.key === "Enter" && crearCompleta()} />
          </Campo>
          <Campo label="Pilar">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PILARES.map(p => (
                <button key={p.key} className={`vh-chip ${nueva.epica === p.nombre ? "on" : ""}`} onClick={() => setNueva({ ...nueva, epica: p.nombre })}>{p.emoji} {p.short}</button>
              ))}
            </div>
          </Campo>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[["Hoy", 0], ["Mañana", 1], ["En una semana", 7]].map(([l, d]) => {
              const f = new Date(); f.setDate(f.getDate() + (d as number));
              const ymd = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
              return <button key={l as string} className={`vh-chip ${nueva.fechaVencimiento === ymd ? "on" : ""}`} onClick={() => setNueva({ ...nueva, fechaVencimiento: nueva.fechaVencimiento === ymd ? "" : ymd })}>{l}</button>;
            })}
          </div>
          <div className="vh-2">
            <Campo label="Fecha"><input type="date" value={nueva.fechaVencimiento} onChange={e => setNueva({ ...nueva, fechaVencimiento: e.target.value })} /></Campo>
            <Campo label="Prioridad">
              <select value={nueva.prioridad} onChange={e => setNueva({ ...nueva, prioridad: e.target.value })}>
                <option>Crítica</option><option>Alta</option><option>Media</option><option>Baja</option>
              </select>
            </Campo>
            <Campo label="Columna">
              <select value={nueva.estado || COLUMNAS[0]} onChange={e => setNueva({ ...nueva, estado: e.target.value })}>
                {COLUMNAS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Campo>
            <Campo label="¿Se repite?">
              <select value={nueva.recurrente ? nueva.frecuencia : "no"} onChange={e => setNueva({ ...nueva, recurrente: e.target.value !== "no", frecuencia: e.target.value === "no" ? nueva.frecuencia : e.target.value })}>
                <option value="no">No, una vez</option><option>Diaria</option><option>Semanal</option><option>Quincenal</option><option>Mensual</option>
              </select>
            </Campo>
          </div>
          <Campo label="Notas (opcional)"><input type="text" value={nueva.notas} onChange={e => setNueva({ ...nueva, notas: e.target.value })} /></Campo>
          <button className="primary" disabled={!nueva.nombre.trim()} onClick={crearCompleta} style={{ padding: 12 }}>Crear tarea</button>
        </div>
      </Sheet>

      {editId && <EditTareaModal tareaId={editId} onClose={() => setEditId(null)} onSaved={cargar} />}
      <Toast data={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
