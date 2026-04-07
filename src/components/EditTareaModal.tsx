"use client";
import { useEffect, useState } from "react";
import { PILARES } from "@/lib/pilares";

const COLUMNAS = ["Sin empezar", "En progreso", "Completada", "Más tarde"];

export default function EditTareaModal({
  tareaId, onClose, onSaved,
}: { tareaId: string; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/tareas/${tareaId}`).then(r => r.json()).then(d => {
      setT({
        ...d,
        fechaVencimiento: d.fechaVencimiento ? d.fechaVencimiento.slice(0, 10) : "",
        fechaInicio: d.fechaInicio ? d.fechaInicio.slice(0, 16) : "",
        fechaFin: d.fechaFin ? d.fechaFin.slice(0, 16) : "",
      });
    });
  }, [tareaId]);

  async function guardar() {
    if (!t) return;
    setSaving(true);
    const data: any = { ...t };
    delete data.id; delete data.proyecto; delete data.createdAt; delete data.updatedAt;
    delete data.habitoLogs; delete data.googleEventId; delete data.googleCalendarId;
    data.fechaVencimiento = data.fechaVencimiento ? new Date(data.fechaVencimiento).toISOString() : null;
    data.fechaInicio = data.fechaInicio ? new Date(data.fechaInicio).toISOString() : null;
    data.fechaFin = data.fechaFin ? new Date(data.fechaFin).toISOString() : null;
    if (data.duracionMin === "" || data.duracionMin == null) data.duracionMin = null;
    else data.duracionMin = Number(data.duracionMin);
    await fetch(`/api/tareas/${tareaId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    onSaved(); onClose();
  }

  async function borrar() {
    if (!confirm("¿Borrar tarea?")) return;
    await fetch(`/api/tareas/${tareaId}`, { method: "DELETE" });
    onSaved(); onClose();
  }

  if (!t) return null;
  const set = (k: string, v: any) => setT({ ...t, [k]: v });
  const F = (label: string, k: string, type: "text" | "date" | "datetime-local" | "number" = "text") => (
    <div>
      <div style={{ fontSize: 10, color: "var(--tx3)" }}>{label}</div>
      <input type={type} value={t[k] ?? ""} onChange={e => set(k, e.target.value)} />
    </div>
  );

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} className="card"
        style={{ width: 720, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>Editar tarea</div>
          <button onClick={onClose} style={{ padding: "2px 10px" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "span 3" }}>
            <div style={{ fontSize: 10, color: "var(--tx3)" }}>Nombre</div>
            <input type="text" value={t.nombre || ""} onChange={e => set("nombre", e.target.value)} />
          </div>

          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Pilar (épica)</div>
            <select value={t.epica || ""} onChange={e => set("epica", e.target.value)}>
              <option value="">—</option>
              {PILARES.map(p => <option key={p.key}>{p.nombre}</option>)}
            </select></div>
          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Sub-épica</div>
            <input type="text" value={t.subepica || ""} onChange={e => set("subepica", e.target.value)} /></div>
          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Tipo</div>
            <select value={t.tipo || "Tarea"} onChange={e => set("tipo", e.target.value)}>
              <option>Tarea</option><option>Hábito</option><option>Vencimiento</option><option>Proyecto</option>
            </select></div>

          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Estado</div>
            <select value={t.estado || "Sin empezar"} onChange={e => set("estado", e.target.value)}>
              {COLUMNAS.map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Prioridad</div>
            <select value={t.prioridad || "Media"} onChange={e => set("prioridad", e.target.value)}>
              <option>Crítica</option><option>Alta</option><option>Media</option><option>Baja</option>
            </select></div>
          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Visibilidad</div>
            <select value={t.caracterVisibilidad || "Relevante"} onChange={e => set("caracterVisibilidad", e.target.value)}>
              <option>Relevante</option><option>No aún</option>
            </select></div>

          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Frecuencia</div>
            <input type="text" value={t.frecuencia || ""} onChange={e => set("frecuencia", e.target.value)} /></div>
          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Días preferidos</div>
            <input type="text" value={t.diasPreferidos || ""} onChange={e => set("diasPreferidos", e.target.value)} /></div>
          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Horario</div>
            <input type="text" value={t.horario || ""} onChange={e => set("horario", e.target.value)} /></div>

          {F("Fecha inicio", "fechaInicio", "datetime-local")}
          {F("Fecha fin", "fechaFin", "datetime-local")}
          {F("Fecha vencimiento", "fechaVencimiento", "date")}

          {F("Duración (min)", "duracionMin", "number")}
          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Energía</div>
            <input type="text" value={t.energia || ""} onChange={e => set("energia", e.target.value)} /></div>
          <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Días anticipación</div>
            <input type="number" value={t.diasAnticipacion ?? ""} onChange={e => set("diasAnticipacion", e.target.value === "" ? null : Number(e.target.value))} /></div>

          <div style={{ gridColumn: "span 3" }}>
            <div style={{ fontSize: 10, color: "var(--tx3)" }}>Notas</div>
            <textarea rows={3} value={t.notas || ""} onChange={e => set("notas", e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="primary" onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
          <button onClick={onClose}>Cancelar</button>
          <button onClick={borrar} style={{ marginLeft: "auto", color: "var(--red-t)" }}>Borrar</button>
        </div>
      </div>
    </div>
  );
}
