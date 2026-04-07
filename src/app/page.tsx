"use client";
import { useEffect, useState } from "react";
import { PILARES, pilarKey } from "@/lib/pilares";

export default function Dashboard() {
  const [tareas, setTareas] = useState<any[]>([]);
  const [notas, setNotas] = useState<any[]>([]);
  const [cronograma, setCronograma] = useState<any[]>([]);
  const [nuevaNota, setNuevaNota] = useState("");

  const DIAS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  const hoy = DIAS[new Date().getDay()];

  async function cargar() {
    const [t, n, c] = await Promise.all([
      fetch("/api/tareas").then(r => r.json()),
      fetch("/api/notas?pantalla=dashboard").then(r => r.json()),
      fetch("/api/cronograma").then(r => r.json()),
    ]);
    setTareas(t); setNotas(n); setCronograma(c);
  }
  useEffect(() => { cargar(); }, []);

  async function agregarNota() {
    if (!nuevaNota.trim()) return;
    await fetch("/api/notas", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ texto: nuevaNota, pantalla: "dashboard" }) });
    setNuevaNota(""); cargar();
  }
  async function borrarNota(id: string) {
    await fetch(`/api/notas/${id}`, { method: "DELETE" }); cargar();
  }

  const total = tareas.length;
  const completadas = tareas.filter(t => t.estado === "Completada" || t.estado === "Hecho").length;
  const habitos = tareas.filter(t => t.tipo === "Hábito").length;
  const vencimientos = tareas
    .filter(t => t.fechaVencimiento)
    .sort((a, b) => +new Date(a.fechaVencimiento) - +new Date(b.fechaVencimiento))
    .slice(0, 6);

  const bloquesHoy = cronograma.filter(c => c.dia === hoy).sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

  const porPilar = PILARES.map(p => {
    const deEste = tareas.filter(t => pilarKey(t.epica) === p.key);
    const comp = deEste.filter(t => t.estado === "Completada" || t.estado === "Hecho").length;
    const pct = deEste.length ? Math.round((comp / deEste.length) * 100) : 0;
    return { ...p, total: deEste.length, pct };
  });

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
      <p style={{ color: "var(--tx3)", marginBottom: 20 }}>Hoy es {hoy} — {new Date().toLocaleDateString("es-AR")}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { l: "Tareas", v: total, s: "totales" },
          { l: "Completadas", v: completadas, s: `${total ? Math.round(completadas/total*100) : 0}%`, c: "var(--sal-t)" },
          { l: "Hábitos", v: habitos, s: "activos", c: "var(--mus-t)" },
          { l: "Vencimientos", v: vencimientos.length, s: "próximos", c: "var(--ges-t)" },
        ].map((m, i) => (
          <div className="card" key={i}>
            <div style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".08em" }}>{m.l}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.c || "var(--tx)", marginTop: 4 }}>{m.v}</div>
            <div style={{ fontSize: 11, color: "var(--tx3)" }}>{m.s}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Brief del día ({hoy})</div>
          {bloquesHoy.length === 0 && <div style={{ color: "var(--tx3)" }}>Sin bloques para hoy</div>}
          {bloquesHoy.map(b => {
            const k = pilarKey(b.pilar);
            return (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--bd)" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--tx3)", width: 48 }}>{b.horarioInicio}</div>
                <div style={{ flex: 1 }}>{b.actividad}</div>
                <span className="tag" style={{ background: `var(--${k}-b)`, color: `var(--${k}-t)` }}>{b.pilar}</span>
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="card-title">Próximos vencimientos</div>
          {vencimientos.length === 0 && <div style={{ color: "var(--tx3)" }}>Sin vencimientos cargados</div>}
          {vencimientos.map(v => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--bd)" }}>
              <div style={{ flex: 1 }}>{v.nombre}</div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--amb-t)" }}>
                {new Date(v.fechaVencimiento).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Progreso por pilar</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {porPilar.map(p => (
            <div key={p.key} style={{ background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: `var(--${p.key}-b)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{p.emoji}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: "var(--tx3)" }}>{p.total} tareas · {p.pct}%</div>
                </div>
              </div>
              <div style={{ height: 4, background: "var(--bd)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${p.pct}%`, height: "100%", background: `var(--${p.key})` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Notas del dashboard</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input type="text" placeholder="Capturar idea..." value={nuevaNota}
            onChange={e => setNuevaNota(e.target.value)}
            onKeyDown={e => e.key === "Enter" && agregarNota()} />
          <button className="primary" onClick={agregarNota}>Agregar</button>
        </div>
        {notas.map(n => (
          <div key={n.id} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--bd)" }}>
            <div style={{ flex: 1 }}>{n.texto}</div>
            <button onClick={() => borrarNota(n.id)} style={{ padding: "2px 8px", fontSize: 11 }}>×</button>
          </div>
        ))}
        {notas.length === 0 && <div style={{ color: "var(--tx3)", fontSize: 12 }}>Sin notas</div>}
      </div>
    </div>
  );
}
