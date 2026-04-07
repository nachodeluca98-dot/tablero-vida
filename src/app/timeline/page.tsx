"use client";
import { useEffect, useState } from "react";
import { pilarKey } from "@/lib/pilares";

const DIAS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

export default function Timeline() {
  const [cronograma, setCronograma] = useState<any[]>([]);
  const [dia, setDia] = useState(DIAS[new Date().getDay()]);

  useEffect(() => {
    fetch("/api/cronograma").then(r => r.json()).then(setCronograma);
  }, []);

  const bloques = cronograma
    .filter(c => c.dia === dia)
    .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Timeline</h1>

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {DIAS.slice(1).concat(DIAS[0]).map(d => (
          <button key={d} onClick={() => setDia(d)}
            className={d === dia ? "primary" : ""}
            style={{ minWidth: 60 }}>{d}</button>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Bloques del {dia}</div>
        {bloques.length === 0 && <div style={{ color: "var(--tx3)" }}>Sin bloques</div>}
        {bloques.map(b => {
          const k = pilarKey(b.pilar);
          return (
            <div key={b.id} style={{ display: "flex", gap: 16, marginBottom: 10 }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--tx3)", width: 55, paddingTop: 14 }}>
                {b.horarioInicio}
              </div>
              <div style={{ width: 12, position: "relative", flexShrink: 0 }}>
                <div style={{ width: 2, background: "var(--bd)", position: "absolute", left: 5, top: 0, bottom: 0 }} />
                <div style={{ width: 12, height: 12, borderRadius: 999, background: `var(--${k})`, position: "absolute", top: 14 }} />
              </div>
              <div style={{ flex: 1, background: `var(--${k}-b)`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600, color: `var(--${k}-t)` }}>{b.actividad}</div>
                <div style={{ fontSize: 11, color: `var(--${k}-t)`, opacity: .85 }}>{b.pilar} — {b.bloque}</div>
                <div style={{ fontSize: 11, color: `var(--${k}-t)`, opacity: .7, fontFamily: "monospace", marginTop: 2 }}>
                  {b.horarioInicio} — {b.horarioFin}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
