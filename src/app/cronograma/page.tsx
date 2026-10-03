"use client";
import { useCallback, useEffect, useState } from "react";
import { PILARES, pilarKey } from "@/lib/pilares";
import { DIAS_CORTOS } from "@/lib/dias";
import { Campo, PageHeader, Sheet, TipBanner, Toast, type ToastData, api, guardarLocal, leerLocal } from "@/components/ui";

const DIAS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const DIA_LARGO: Record<string, string> = { Lun: "Lunes", Mar: "Martes", Mie: "Miércoles", Jue: "Jueves", Vie: "Viernes", Sab: "Sábado", Dom: "Domingo" };
const BLOQUES = ["AM", "Main", "Rest", "Final"];
const minutos = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + (b || 0); };

function esActual(b: any, ahora: Date) {
  if (b.dia !== DIAS_CORTOS[ahora.getDay()]) return false;
  const m = ahora.getHours() * 60 + ahora.getMinutes();
  const i = minutos(b.horarioInicio), f = minutos(b.horarioFin);
  return f <= i ? m >= i || m < f : m >= i && m < f;
}

export default function Semana() {
  const [items, setItems] = useState<any[] | null>(null);
  const [vista, setVista] = useState<"dia" | "semana">("dia");
  const [dia, setDia] = useState("Lun");
  const [edit, setEdit] = useState<any | null>(null);
  const [copiar, setCopiar] = useState<string[] | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  // la hora se calcula solo en el navegador: el servidor corre en UTC
  const [ahora, setAhora] = useState(() => new Date(0));

  const cargar = useCallback(async () => { setItems(await api("/api/cronograma")); }, []);
  useEffect(() => {
    cargar();
    const v = leerLocal("semana-vista");
    if (v === "dia" || v === "semana") setVista(v);
    setAhora(new Date());
    setDia(DIAS_CORTOS[new Date().getDay()]);
    const id = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(id);
  }, [cargar]);

  const ordenar = (a: any, b: any) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || a.horarioInicio.localeCompare(b.horarioInicio);
  const delDia = (d: string) => (items ?? []).filter(i => i.dia === d).sort(ordenar);
  const cambiarVista = (v: "dia" | "semana") => { setVista(v); guardarLocal("semana-vista", v); };

  async function guardar() {
    if (!edit) return;
    const { id, ...data } = edit;
    if (!data.actividad.trim()) return;
    if (id) await api(`/api/cronograma/${id}`, "PATCH", data);
    else await api("/api/cronograma", "POST", data);
    setEdit(null);
    cargar();
  }

  async function borrar(b: any) {
    await api(`/api/cronograma/${b.id}`, "DELETE");
    setEdit(null);
    const { id, ...data } = b;
    setToast({ titulo: "Bloque borrado", lineas: [`${DIA_LARGO[b.dia]} · ${b.actividad}`], deshacer: async () => { await api("/api/cronograma", "POST", data); cargar(); } });
    cargar();
  }

  async function copiarDia(destinos: string[]) {
    const origen = delDia(dia);
    for (const d of destinos) {
      for (const b of delDia(d)) await api(`/api/cronograma/${b.id}`, "DELETE");
      for (const b of origen) {
        const { id, ...data } = b;
        await api("/api/cronograma", "POST", { ...data, dia: d });
      }
    }
    setCopiar(null);
    setToast({ titulo: `✓ ${DIA_LARGO[dia]} copiado`, lineas: [destinos.map(d => DIA_LARGO[d]).join(", ")] });
    cargar();
  }

  const nuevo = (d = dia) => setEdit({ dia: d, bloque: "AM", actividad: "", pilar: "Profesional", horarioInicio: "09:00", horarioFin: "10:00" });

  const Bloque = ({ b, compacto }: { b: any; compacto?: boolean }) => {
    const k = pilarKey(b.pilar);
    const act = esActual(b, ahora);
    return (
      <button onClick={() => setEdit(b)} style={{
        display: "block", width: "100%", textAlign: "left", background: `var(--${k}-b)`, borderRadius: 8,
        border: act ? `2px solid var(--${k})` : "1px solid transparent", padding: compacto ? 8 : 12, marginBottom: compacto ? 6 : 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontWeight: 600, color: `var(--${k}-t)`, fontSize: compacto ? 12 : 14 }}>{b.actividad}</span>
          {act && <span className="tag" style={{ background: `var(--${k})`, color: "#000" }}>ahora</span>}
        </div>
        <div style={{ fontSize: 11, color: `var(--${k}-t)`, opacity: .8, fontFamily: "monospace", marginTop: 2 }}>
          {b.horarioInicio}–{b.horarioFin}{!compacto && ` · ${PILARES.find(p => p.key === k)?.emoji} ${b.pilar}`}
        </div>
      </button>
    );
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader titulo="Semana" sub="Tu semana tipo: qué bloque toca cada día">
        <button className="primary" onClick={() => nuevo()}>+ Bloque</button>
      </PageHeader>

      <TipBanner id="semana-1">
        Con tu semana cargada, la pantalla <b>Hoy</b> y el bot te dicen qué toca en cada momento. Tocá un bloque para editarlo y usá <b>Copiar día</b> para repetir rutinas.
      </TipBanner>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button className={`vh-tab ${vista === "dia" ? "on" : ""}`} onClick={() => cambiarVista("dia")}>Día</button>
        <button className={`vh-tab ${vista === "semana" ? "on" : ""}`} onClick={() => cambiarVista("semana")}>Semana</button>
      </div>

      {items && items.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 34 }}>🗓️</div>
          <div style={{ fontWeight: 700, fontSize: 16, margin: "6px 0" }}>Armá tu semana tipo</div>
          <div style={{ color: "var(--tx2)", fontSize: 13, marginBottom: 14 }}>
            Cargá los bloques de un día (trabajo, entrenamiento, descanso) y después copialo a los días que se repiten.
          </div>
          <button className="primary" onClick={() => nuevo("Lun")}>Crear el primer bloque</button>
        </div>
      )}

      {vista === "dia" && items && items.length > 0 && (
        <>
          <div className="chips-scroll" style={{ marginBottom: 12 }}>
            {DIAS.map(d => {
              const esHoy = d === DIAS_CORTOS[ahora.getDay()];
              return (
                <button key={d} className={`vh-chip ${dia === d ? "on" : ""}`} onClick={() => setDia(d)} style={{ minWidth: 52 }}>
                  {d}{esHoy ? " •" : ""}
                </button>
              );
            })}
          </div>
          <div className="card">
            <div className="seccion-titulo" style={{ margin: "0 0 12px" }}>
              <span>{DIA_LARGO[dia]}{dia === DIAS_CORTOS[ahora.getDay()] ? " · hoy" : ""}</span>
              {delDia(dia).length > 0 && <button onClick={() => setCopiar([])} style={{ fontSize: 11, padding: "3px 10px" }}>Copiar día</button>}
            </div>
            {delDia(dia).length === 0 && (
              <div style={{ color: "var(--tx3)", fontSize: 12 }}>
                Sin bloques. <button onClick={() => nuevo(dia)} style={{ border: "none", background: "none", color: "var(--acc)", padding: 0, fontSize: 12 }}>Agregar uno</button>
              </div>
            )}
            {delDia(dia).map(b => (
              <div key={b.id} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--tx3)", width: 42, paddingTop: 13, flexShrink: 0 }}>{b.horarioInicio}</div>
                <div style={{ flex: 1, minWidth: 0 }}><Bloque b={b} /></div>
              </div>
            ))}
          </div>
        </>
      )}

      {vista === "semana" && items && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
          {DIAS.map(d => (
            <div key={d} className="card" style={{ padding: 8, borderColor: d === DIAS_CORTOS[ahora.getDay()] ? "var(--acc)" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: d === DIAS_CORTOS[ahora.getDay()] ? "var(--acc)" : "var(--tx3)" }}>{d}</span>
                <button onClick={() => nuevo(d)} aria-label={`Agregar bloque el ${DIA_LARGO[d]}`} style={{ border: "none", background: "none", color: "var(--tx3)", padding: 0 }}>＋</button>
              </div>
              {delDia(d).map(b => <Bloque key={b.id} b={b} compacto />)}
            </div>
          ))}
        </div>
      )}

      <Sheet abierto={!!edit} onCerrar={() => setEdit(null)} titulo={edit?.id ? "Editar bloque" : "Nuevo bloque"}>
        {edit && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Campo label="Actividad">
              <input type="text" autoFocus={!edit.id} value={edit.actividad} placeholder="Entrenar, Trabajo, Canto..."
                onChange={e => setEdit({ ...edit, actividad: e.target.value })} onKeyDown={e => e.key === "Enter" && guardar()} />
            </Campo>
            <Campo label="Día">
              <div className="chips-scroll">
                {DIAS.map(d => <button key={d} className={`vh-chip ${edit.dia === d ? "on" : ""}`} onClick={() => setEdit({ ...edit, dia: d })}>{d}</button>)}
              </div>
            </Campo>
            <div className="vh-2">
              <Campo label="Empieza"><input type="time" value={edit.horarioInicio} onChange={e => setEdit({ ...edit, horarioInicio: e.target.value })} /></Campo>
              <Campo label="Termina"><input type="time" value={edit.horarioFin} onChange={e => setEdit({ ...edit, horarioFin: e.target.value })} /></Campo>
            </div>
            <Campo label="Pilar">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {PILARES.map(p => <button key={p.key} className={`vh-chip ${edit.pilar === p.nombre ? "on" : ""}`} onClick={() => setEdit({ ...edit, pilar: p.nombre })}>{p.emoji} {p.short}</button>)}
              </div>
            </Campo>
            <Campo label="Momento del día">
              <select value={edit.bloque} onChange={e => setEdit({ ...edit, bloque: e.target.value })}>
                {BLOQUES.map(b => <option key={b}>{b}</option>)}
              </select>
            </Campo>
            <button className="primary" disabled={!edit.actividad.trim()} onClick={guardar} style={{ padding: 12 }}>Guardar</button>
            {edit.id && <button onClick={() => borrar(edit)} style={{ border: "none", background: "none", color: "var(--red-t)" }}>Borrar bloque</button>}
          </div>
        )}
      </Sheet>

      <Sheet abierto={!!copiar} onCerrar={() => setCopiar(null)} titulo={`Copiar ${DIA_LARGO[dia]} a…`}>
        {copiar && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--tx2)" }}>Los días que elijas quedan iguales a {DIA_LARGO[dia]} (se reemplazan sus bloques).</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {DIAS.filter(d => d !== dia).map(d => (
                <button key={d} className={`vh-chip ${copiar.includes(d) ? "on" : ""}`}
                  onClick={() => setCopiar(copiar.includes(d) ? copiar.filter(x => x !== d) : [...copiar, d])}>{DIA_LARGO[d]}</button>
              ))}
            </div>
            <button className="primary" disabled={!copiar.length} onClick={() => copiarDia(copiar)} style={{ padding: 12 }}>
              Copiar a {copiar.length || "…"} día{copiar.length === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </Sheet>

      <Toast data={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
