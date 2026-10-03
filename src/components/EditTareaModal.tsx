"use client";
import { useEffect, useState } from "react";
import { PILARES } from "@/lib/pilares";
import { PUNTUAL } from "@/lib/tareas";
import { Campo, Sheet, api } from "@/components/ui";

const ESTADOS = ["Sin empezar", "Agendada", "En progreso", "Completada", "Más tarde"];

export default function EditTareaModal({ tareaId, onClose, onSaved, extra }: {
  tareaId: string; onClose: () => void; onSaved: () => void; extra?: (t: any) => React.ReactNode;
}) {
  const [t, setT] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api(`/api/tareas/${tareaId}`).then(d => {
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
    for (const k of ["id", "proyecto", "createdAt", "updatedAt", "habitoLogs", "googleEventId", "googleCalendarId"]) delete data[k];
    // fecha sola al mediodía local para que no se corra de día
    data.fechaVencimiento = data.fechaVencimiento ? new Date(`${data.fechaVencimiento}T12:00:00`).toISOString() : null;
    data.fechaInicio = data.fechaInicio ? new Date(data.fechaInicio).toISOString() : null;
    data.fechaFin = data.fechaFin ? new Date(data.fechaFin).toISOString() : null;
    data.duracionMin = data.duracionMin === "" || data.duracionMin == null ? null : Number(data.duracionMin);
    await api(`/api/tareas/${tareaId}`, "PATCH", data);
    setSaving(false);
    onSaved(); onClose();
  }

  async function borrar() {
    if (!confirm(t?.tipo === "Hábito" ? "¿Borrar el hábito y todo su historial?" : "¿Borrar la tarea?")) return;
    await api(`/api/tareas/${tareaId}`, "DELETE");
    onSaved(); onClose();
  }

  const set = (k: string, v: any) => setT((p: any) => ({ ...p, [k]: v }));
  const puntual = !t?.frecuencia || PUNTUAL.includes(String(t.frecuencia).toLowerCase());
  const estados = t && t.estado && !ESTADOS.includes(t.estado) ? [t.estado, ...ESTADOS] : ESTADOS;
  const esHabito = t?.tipo === "Hábito";

  return (
    <Sheet abierto onCerrar={onClose} titulo={esHabito ? "Editar hábito" : "Editar tarea"}>
      {!t ? <div style={{ color: "var(--tx3)" }}>Cargando...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Campo label="Nombre"><input type="text" value={t.nombre || ""} onChange={e => set("nombre", e.target.value)} /></Campo>

          <Campo label="Pilar">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PILARES.map(p => (
                <button key={p.key} className={`vh-chip ${t.epica === p.nombre ? "on" : ""}`} onClick={() => set("epica", p.nombre)}>{p.emoji} {p.short}</button>
              ))}
            </div>
          </Campo>

          {!esHabito && (
            <div className="vh-2">
              <Campo label="Estado">
                <select value={t.estado || "Sin empezar"} onChange={e => set("estado", e.target.value)}>
                  {estados.map(c => <option key={c}>{c}</option>)}
                </select>
              </Campo>
              <Campo label="Prioridad">
                <select value={t.prioridad || "Media"} onChange={e => set("prioridad", e.target.value)}>
                  <option>Crítica</option><option>Alta</option><option>Media</option><option>Baja</option>
                </select>
              </Campo>
            </div>
          )}

          <div style={{ padding: 10, background: "var(--bg3)", borderRadius: 8 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <button className={`vh-chip ${puntual ? "on" : ""}`} onClick={() => set("frecuencia", "Puntual")}>⚡ Una vez</button>
              <button className={`vh-chip ${!puntual ? "on" : ""}`} onClick={() => set("frecuencia", puntual ? "Diaria" : t.frecuencia)}>🔁 Se repite</button>
            </div>
            {puntual ? (
              <div className="vh-2">
                <Campo label="Fecha"><input type="date" value={t.fechaVencimiento || ""} onChange={e => set("fechaVencimiento", e.target.value)} /></Campo>
                <Campo label="Horario"><input type="time" value={t.horario || ""} onChange={e => set("horario", e.target.value)} /></Campo>
              </div>
            ) : (
              <div className="vh-2">
                <Campo label="Frecuencia">
                  <select value={t.frecuencia} onChange={e => set("frecuencia", e.target.value)}>
                    <option>Diaria</option><option>Semanal</option><option>Quincenal</option><option>Mensual</option><option>Cada N semanas</option>
                  </select>
                </Campo>
                <Campo label="Horario"><input type="time" value={t.horario || ""} onChange={e => set("horario", e.target.value)} /></Campo>
                {t.frecuencia !== "Diaria" && (
                  <Campo full label={t.frecuencia === "Semanal" || t.frecuencia === "Quincenal" ? "Qué días (L,M,X,J,V,S,D)" : t.frecuencia === "Cada N semanas" ? "Cada cuántas semanas" : "Día del mes"}>
                    <input type="text" value={t.diasPreferidos || ""} onChange={e => set("diasPreferidos", e.target.value)}
                      placeholder={t.frecuencia === "Cada N semanas" ? "2" : t.frecuencia === "Mensual" ? "15" : "L,X,V"} />
                  </Campo>
                )}
              </div>
            )}
          </div>

          <Campo label="Notas"><textarea rows={2} value={t.notas || ""} onChange={e => set("notas", e.target.value)} /></Campo>

          <details className="vh-details">
            <summary style={{ fontSize: 12, color: "var(--tx2)" }}>Más opciones ›</summary>
            <div className="vh-2" style={{ marginTop: 10 }}>
              <Campo label="Tipo">
                <select value={t.tipo || "Tarea"} onChange={e => set("tipo", e.target.value)}>
                  <option>Tarea</option><option>Hábito</option><option>Vencimiento</option><option>Proyecto</option>
                </select>
              </Campo>
              <Campo label="Visibilidad">
                <select value={t.caracterVisibilidad || "Relevante"} onChange={e => set("caracterVisibilidad", e.target.value)}>
                  <option>Relevante</option><option>No aún</option>
                </select>
              </Campo>
              <Campo label="Sub-épica"><input type="text" value={t.subepica || ""} onChange={e => set("subepica", e.target.value)} /></Campo>
              <Campo label="Duración (min)"><input type="number" inputMode="numeric" value={t.duracionMin ?? ""} onChange={e => set("duracionMin", e.target.value)} /></Campo>
              <Campo label="Inicio"><input type="datetime-local" value={t.fechaInicio || ""} onChange={e => set("fechaInicio", e.target.value)} /></Campo>
              <Campo label="Fin"><input type="datetime-local" value={t.fechaFin || ""} onChange={e => set("fechaFin", e.target.value)} /></Campo>
              <Campo label="Energía"><input type="text" value={t.energia || ""} onChange={e => set("energia", e.target.value)} /></Campo>
              <Campo label="Avisar días antes"><input type="number" inputMode="numeric" value={t.diasAnticipacion ?? ""} onChange={e => set("diasAnticipacion", e.target.value === "" ? null : Number(e.target.value))} /></Campo>
            </div>
          </details>

          {extra?.(t)}

          <button className="primary" onClick={guardar} disabled={saving} style={{ padding: 12 }}>{saving ? "Guardando..." : "Guardar"}</button>
          <button onClick={borrar} style={{ border: "none", background: "none", color: "var(--red-t)" }}>{esHabito ? "Borrar hábito" : "Borrar tarea"}</button>
        </div>
      )}
    </Sheet>
  );
}
