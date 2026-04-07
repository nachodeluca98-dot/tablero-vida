"use client";
import { useEffect, useState } from "react";
import { pilarKey } from "@/lib/pilares";

export default function Vencimientos() {
  const [tareas, setTareas] = useState<any[]>([]);
  useEffect(() => { fetch("/api/tareas").then(r => r.json()).then(setTareas); }, []);

  const vencimientos = tareas
    .filter(t => t.fechaVencimiento || t.tipo === "Vencimiento")
    .sort((a, b) => {
      const da = a.fechaVencimiento ? +new Date(a.fechaVencimiento) : Infinity;
      const db = b.fechaVencimiento ? +new Date(b.fechaVencimiento) : Infinity;
      return da - db;
    });

  function diasHasta(fecha: string) {
    const d = Math.ceil((+new Date(fecha) - Date.now()) / 86400000);
    if (d < 0) return { txt: `Vencido ${-d}d`, color: "red" };
    if (d === 0) return { txt: "Hoy", color: "red" };
    if (d === 1) return { txt: "Mañana", color: "red" };
    if (d <= 7) return { txt: `${d} días`, color: "amb" };
    return { txt: `${d} días`, color: "met" };
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Vencimientos</h1>
      <div className="card">
        <table>
          <thead>
            <tr><th>Tarea</th><th>Fecha</th><th>Épica</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {vencimientos.map(v => {
              const k = pilarKey(v.epica);
              const d = v.fechaVencimiento ? diasHasta(v.fechaVencimiento) : null;
              return (
                <tr key={v.id}>
                  <td style={{ fontWeight: 500 }}>{v.nombre}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                    {v.fechaVencimiento ? new Date(v.fechaVencimiento).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—"}
                  </td>
                  <td>{v.epica && <span className="tag" style={{ background: `var(--${k}-b)`, color: `var(--${k}-t)` }}>{v.epica}</span>}</td>
                  <td>{d && <span className="tag" style={{ background: `var(--${d.color}-b)`, color: `var(--${d.color}-t)` }}>{d.txt}</span>}</td>
                </tr>
              );
            })}
            {vencimientos.length === 0 && <tr><td colSpan={4} style={{ color: "var(--tx3)", textAlign: "center" }}>Sin vencimientos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
