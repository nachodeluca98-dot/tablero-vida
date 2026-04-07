"use client";
import { useEffect, useState } from "react";
import { PILARES, pilarKey } from "@/lib/pilares";

const DIAS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const BLOQUES = ["AM", "Main", "Rest", "Final"];

export default function Cronograma() {
  const [items, setItems] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);

  async function cargar() {
    setItems(await fetch("/api/cronograma").then(r => r.json()));
  }
  useEffect(() => { cargar(); }, []);

  async function guardar() {
    if (!edit) return;
    const { id, ...data } = edit;
    if (id) {
      await fetch(`/api/cronograma/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    } else {
      await fetch("/api/cronograma", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    }
    setEdit(null); cargar();
  }

  async function borrar(id: string) {
    await fetch(`/api/cronograma/${id}`, { method: "DELETE" });
    setEdit(null); cargar();
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Cronograma base (editable)</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr><th>Día</th><th>Bloque</th><th>Actividad</th><th>Pilar</th><th>Inicio</th><th>Fin</th><th></th></tr>
          </thead>
          <tbody>
            {items.sort((a,b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || a.horarioInicio.localeCompare(b.horarioInicio)).map(i => {
              const k = pilarKey(i.pilar);
              return (
                <tr key={i.id}>
                  <td>{i.dia}</td>
                  <td>{i.bloque}</td>
                  <td style={{ fontWeight: 500 }}>{i.actividad}</td>
                  <td><span className="tag" style={{ background: `var(--${k}-b)`, color: `var(--${k}-t)` }}>{i.pilar}</span></td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{i.horarioInicio}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{i.horarioFin}</td>
                  <td><button onClick={() => setEdit(i)} style={{ padding: "2px 8px", fontSize: 11 }}>Editar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button className="primary" style={{ marginTop: 10 }} onClick={() => setEdit({ dia: "Lun", bloque: "AM", actividad: "", pilar: "Profesional", horarioInicio: "09:00", horarioFin: "10:00" })}>+ Agregar bloque</button>
      </div>

      {edit && (
        <div className="card">
          <div className="card-title">{edit.id ? "Editar" : "Nuevo"} bloque</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Día</div>
              <select value={edit.dia} onChange={e => setEdit({ ...edit, dia: e.target.value })}>
                {DIAS.map(d => <option key={d}>{d}</option>)}
              </select></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Bloque</div>
              <select value={edit.bloque} onChange={e => setEdit({ ...edit, bloque: e.target.value })}>
                {BLOQUES.map(b => <option key={b}>{b}</option>)}
              </select></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Pilar</div>
              <select value={edit.pilar} onChange={e => setEdit({ ...edit, pilar: e.target.value })}>
                {PILARES.map(p => <option key={p.key}>{p.nombre}</option>)}
              </select></div>
            <div style={{ gridColumn: "span 3" }}><div style={{ fontSize: 10, color: "var(--tx3)" }}>Actividad</div>
              <input type="text" value={edit.actividad} onChange={e => setEdit({ ...edit, actividad: e.target.value })} /></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Inicio</div>
              <input type="time" value={edit.horarioInicio} onChange={e => setEdit({ ...edit, horarioInicio: e.target.value })} /></div>
            <div><div style={{ fontSize: 10, color: "var(--tx3)" }}>Fin</div>
              <input type="time" value={edit.horarioFin} onChange={e => setEdit({ ...edit, horarioFin: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="primary" onClick={guardar}>Guardar</button>
            <button onClick={() => setEdit(null)}>Cancelar</button>
            {edit.id && <button onClick={() => borrar(edit.id)} style={{ color: "var(--red-t)", marginLeft: "auto" }}>Borrar</button>}
          </div>
        </div>
      )}
    </div>
  );
}
