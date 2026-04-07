"use client";
import { useEffect, useState } from "react";
import { pilarKey } from "@/lib/pilares";

const DIAS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const BLOQUES = ["AM", "Main", "Rest", "Final"];

export default function Calendario() {
  const [cronograma, setCronograma] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/cronograma").then(r => r.json()).then(setCronograma);
  }, []);

  function get(dia: string, bloque: string) {
    return cronograma.find(c => c.dia === dia && c.bloque === bloque);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Calendario semanal</h1>
      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7,1fr)", gap: 6 }}>
          <div />
          {DIAS.map(d => (
            <div key={d} style={{ fontSize: 11, color: "var(--tx3)", textAlign: "center", fontWeight: 600, textTransform: "uppercase" }}>{d}</div>
          ))}
          {BLOQUES.flatMap(b => [
            <div key={"h" + b} style={{ fontSize: 10, color: "var(--tx3)", display: "flex", alignItems: "center", fontWeight: 600 }}>{b}</div>,
            ...DIAS.map(d => {
              const item = get(d, b);
              if (!item) return <div key={d + b} style={{ background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 6, minHeight: 56 }} />;
              const k = pilarKey(item.pilar);
              return (
                <div key={d + b} style={{ background: `var(--${k}-b)`, border: "1px solid var(--bd)", borderRadius: 6, padding: 8, minHeight: 56 }}>
                  <div style={{ fontWeight: 600, color: `var(--${k}-t)`, fontSize: 12 }}>{item.actividad}</div>
                  <div style={{ fontSize: 10, color: `var(--${k}-t)`, opacity: .75, fontFamily: "monospace" }}>{item.horarioInicio}</div>
                </div>
              );
            })
          ])}
        </div>
      </div>
    </div>
  );
}
