"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PILARES, pilarKey } from "@/lib/pilares";
import { estaCompleta, venceInfo } from "@/lib/tareas";
import EditTareaModal from "@/components/EditTareaModal";
import { PageHeader, TipBanner, Toast, type ToastData, api } from "@/components/ui";

const GRUPOS = [
  { key: "vencidos", label: "Vencidos", color: "red", test: (d: number) => d < 0 },
  { key: "semana", label: "Esta semana", color: "amb", test: (d: number) => d >= 0 && d <= 7 },
  { key: "mes", label: "Este mes", color: "ges", test: (d: number) => d > 7 && d <= 31 },
  { key: "despues", label: "Más adelante", color: "met", test: (d: number) => d > 31 },
];

export default function Vencimientos() {
  const [tareas, setTareas] = useState<any[] | null>(null);
  const [autos, setAutos] = useState<any[]>([]);
  const [nombre, setNombre] = useState("");
  const [fechaN, setFechaN] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const cargar = useCallback(async () => {
    const [t, a] = await Promise.all([api("/api/tareas"), api("/api/vehiculos/pendientes").catch(() => [])]);
    setTareas(t); setAutos(a);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const conFecha = useMemo(() => (tareas ?? [])
    .filter(t => t.fechaVencimiento && !estaCompleta(t))
    .map(t => ({ t, v: venceInfo(t.fechaVencimiento) }))
    .sort((a, b) => a.v.dias! - b.v.dias!), [tareas]);
  const sinFecha = (tareas ?? []).filter(t => t.tipo === "Vencimiento" && !t.fechaVencimiento && !estaCompleta(t));

  async function completar(t: any) {
    const previo = t.estado;
    setTareas(prev => prev?.map(x => (x.id === t.id ? { ...x, estado: "Completada" } : x)) ?? prev);
    await api(`/api/tareas/${t.id}`, "PATCH", { estado: "Completada" });
    setToast({ titulo: "✓ Resuelto", lineas: [t.nombre], deshacer: async () => { await api(`/api/tareas/${t.id}`, "PATCH", { estado: previo }); cargar(); } });
  }

  async function agregar() {
    if (!nombre.trim() || !fechaN) return;
    await api("/api/tareas", "POST", {
      nombre: nombre.trim(), tipo: "Vencimiento", estado: "Sin empezar", epica: "Gestión adulta",
      caracterVisibilidad: "Relevante", prioridad: "Alta", fechaVencimiento: new Date(`${fechaN}T12:00:00`).toISOString(),
    });
    setNombre(""); setFechaN("");
    setToast({ titulo: "✓ Vencimiento agendado", lineas: ["Te aviso por Telegram cuando se acerque."] });
    cargar();
  }

  const Fila = ({ t, v }: { t: any; v: any }) => {
    const k = pilarKey(t.epica);
    return (
      <div className="fila">
        <button className="check" onClick={() => completar(t)} aria-label="Marcar resuelto" />
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setEditId(t.id)}>
          <div>{t.nombre}</div>
          <div style={{ fontSize: 11, color: "var(--tx3)" }}>
            {PILARES.find(p => p.key === k)?.emoji} {t.epica || "Sin pilar"}
            {t.fechaVencimiento && ` · ${new Date(t.fechaVencimiento).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}`}
          </div>
        </div>
        {v && <span className="tag" style={{ background: v.bg, color: `var(--${v.color})`, textTransform: "none", whiteSpace: "nowrap" }}>{v.txt}</span>}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader titulo="Vencimientos" sub={tareas ? `${conFecha.filter(x => x.v.dias! < 0).length} vencidos · ${conFecha.filter(x => x.v.dias! >= 0 && x.v.dias! <= 7).length} esta semana` : undefined} />

      <TipBanner id="vencimientos-1">
        Cargá acá pagos, trámites y fechas límite. Tildá el círculo cuando lo resuelvas; si te equivocás, tenés <b>Deshacer</b>.
      </TipBanner>

      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input type="text" value={nombre} placeholder="Ej: pagar ABL, renovar DNI..." onChange={e => setNombre(e.target.value)}
            onKeyDown={e => e.key === "Enter" && agregar()} style={{ flex: "2 1 180px", minWidth: 0 }} />
          <input type="date" value={fechaN} onChange={e => setFechaN(e.target.value)} style={{ flex: "1 1 130px", minWidth: 0 }} />
          <button className="primary" disabled={!nombre.trim() || !fechaN} onClick={agregar}>Agendar</button>
        </div>
      </div>

      {autos.length > 0 && (
        <Link href="/vehiculos" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card" style={{ padding: 12, marginBottom: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>🚗</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{autos.length} pendiente{autos.length > 1 ? "s" : ""} de tus vehículos</div>
              <div style={{ fontSize: 12, color: "var(--tx3)" }}>{autos.slice(0, 2).map(a => a.titulo).join(" · ")}</div>
            </div>
            <span style={{ color: "var(--tx3)" }}>›</span>
          </div>
        </Link>
      )}

      {tareas && !conFecha.length && !sinFecha.length && (
        <div className="card" style={{ textAlign: "center", padding: 24, color: "var(--tx2)" }}>
          <div style={{ fontSize: 30 }}>✨</div>Nada por vencer. Agendá arriba lo próximo que no te querés olvidar.
        </div>
      )}

      {GRUPOS.map(g => {
        const lista = conFecha.filter(x => g.test(x.v.dias!));
        if (!lista.length) return null;
        return (
          <div key={g.key} style={{ marginBottom: 14 }}>
            <div className="seccion-titulo" style={{ color: `var(--${g.color}-t)` }}><span>{g.label}</span><span>{lista.length}</span></div>
            <div className="card" style={{ padding: "2px 12px", borderLeft: `3px solid var(--${g.color})` }}>
              {lista.map(({ t, v }) => <Fila key={t.id} t={t} v={v} />)}
            </div>
          </div>
        );
      })}

      {sinFecha.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="seccion-titulo"><span>Sin fecha</span><span>{sinFecha.length}</span></div>
          <div className="card" style={{ padding: "2px 12px" }}>
            {sinFecha.map(t => <Fila key={t.id} t={t} v={null} />)}
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 6 }}>Tocá uno para ponerle fecha.</div>
        </div>
      )}

      {editId && <EditTareaModal tareaId={editId} onClose={() => setEditId(null)} onSaved={cargar} />}
      <Toast data={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
