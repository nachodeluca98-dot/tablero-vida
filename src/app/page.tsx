"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PILARES, pilarKey } from "@/lib/pilares";
import { DIAS_CORTOS } from "@/lib/dias";
import { esDeHoy, esRecurrente, estaCompleta, hoyMediodiaISO, venceInfo } from "@/lib/tareas";
import { Toast, type ToastData, api, guardarLocal, leerLocal, ymdLocal } from "@/components/ui";

const minutos = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + (b || 0); };

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? "Buenas noches" : h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

function PrimerosPasos({ settings, cronograma, habitos }: { settings: any; cronograma: any[]; habitos: any[] }) {
  const [oculto, setOculto] = useState(true);
  const [push, setPush] = useState(false);
  const [coach, setCoach] = useState(false);
  useEffect(() => {
    setOculto(leerLocal("hoy-pasos-oculto") === "1");
    setCoach(leerLocal("hoy-paso-coach") === "1");
    setPush(typeof Notification !== "undefined" && Notification.permission === "granted");
  }, []);
  if (!settings) return null;
  const pasos = [
    { ok: cronograma.length > 0, t: "Armá tu semana tipo", d: "Bloques por día: así sé qué toca ahora", href: "/cronograma" },
    { ok: habitos.length > 0, t: "Creá tu primer hábito", d: "Se marca de un toque desde acá", href: "/habitos" },
    { ok: !!(settings.telegramConectado || settings.telegramChatId), t: "Conectá Telegram", d: "Briefing a la mañana y review a la noche", href: "/settings" },
    { ok: push, t: "Activá las notificaciones", d: "Avisos en este dispositivo", href: "/settings" },
    { ok: coach, t: "Pedile algo al coach", d: "Tocá \"¿Qué hago ahora?\" más abajo" },
  ];
  const hechos = pasos.filter(p => p.ok).length;
  if (oculto || hechos === pasos.length) return null;
  return (
    <div className="card" style={{ borderColor: "rgba(245,158,11,.4)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>🚀 Poné a punto tu tablero · {hechos}/{pasos.length}</div>
        <button onClick={() => { guardarLocal("hoy-pasos-oculto", "1"); setOculto(true); }}
          style={{ border: "none", background: "none", color: "var(--tx3)", fontSize: 11, padding: 0 }}>Ocultar</button>
      </div>
      <div className="vh-progress" style={{ marginBottom: 8 }}><div style={{ width: `${(hechos / pasos.length) * 100}%` }} /></div>
      {pasos.filter(p => !p.ok).slice(0, 3).map(p => (
        <div key={p.t} className="fila">
          <div className="check" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>{p.t}</div>
            <div style={{ fontSize: 11, color: "var(--tx3)" }}>{p.d}</div>
          </div>
          {p.href && <Link href={p.href}><button style={{ fontSize: 11, padding: "3px 10px" }}>Ir</button></Link>}
        </div>
      ))}
    </div>
  );
}

export default function Hoy() {
  const [tareas, setTareas] = useState<any[] | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [cronograma, setCronograma] = useState<any[]>([]);
  const [notas, setNotas] = useState<any[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [autos, setAutos] = useState<any[]>([]);
  const [captura, setCaptura] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachMsg, setCoachMsg] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  // la hora se calcula solo en el navegador: el servidor corre en UTC
  const [ahoraCliente, setAhora] = useState<Date | null>(null);
  const ahora = ahoraCliente ?? new Date(0);
  const hoy = ahoraCliente ? ymdLocal(ahoraCliente) : "";

  const cargar = useCallback(async () => {
    const [t, l, c, n, i, s, a] = await Promise.all([
      api("/api/tareas"),
      api("/api/habitos/logs").catch(() => []),
      api("/api/cronograma").catch(() => []),
      api("/api/notas?pantalla=dashboard").catch(() => []),
      api("/api/insights").catch(() => null),
      api("/api/settings").catch(() => null),
      api("/api/vehiculos/pendientes").catch(() => []),
    ]);
    setTareas(t); setLogs(l); setCronograma(c); setNotas(n); setInsights(i); setSettings(s); setAutos(a);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const habitos = useMemo(() => (tareas ?? []).filter(t => t.tipo === "Hábito" && t.mostrarEnHabitos !== false && t.caracterVisibilidad !== "No aún"), [tareas]);
  const hechosHoy = useMemo(() => new Map(logs.filter(l => l.fecha === hoy).map(l => [l.tareaId, l.estado || "hecho"])), [logs, hoy]);
  const foco = useMemo(() => (tareas ?? []).filter(esDeHoy).sort((a, b) => {
    const da = a.fechaVencimiento ? +new Date(a.fechaVencimiento) : Infinity;
    const db = b.fechaVencimiento ? +new Date(b.fechaVencimiento) : Infinity;
    return da - db;
  }), [tareas]);
  const proximos = useMemo(() => (tareas ?? [])
    .filter(t => !estaCompleta(t) && !esRecurrente(t) && t.fechaVencimiento && !esDeHoy(t))
    .map(t => ({ t, v: venceInfo(t.fechaVencimiento) }))
    .filter(x => x.v.dias != null && x.v.dias > 0 && x.v.dias <= 7)
    .sort((a, b) => a.v.dias! - b.v.dias!), [tareas]);

  const bloquesHoy = !ahoraCliente ? [] : cronograma.filter(c => c.dia === DIAS_CORTOS[ahora.getDay()]).sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  const bloqueActual = bloquesHoy.find(b => {
    const i = minutos(b.horarioInicio), f = minutos(b.horarioFin);
    return f <= i ? min >= i || min < f : min >= i && min < f;
  });
  const bloqueProximo = bloquesHoy.find(b => minutos(b.horarioInicio) > min);
  const senales = (insights?.senales ?? []).filter((s: any) => !["bloque", "habitos", "vencimientos", "ok"].includes(s.tipo));
  const autosUrgentes = autos.filter(a => a.nivel !== "relevante");

  async function marcarHabito(h: any) {
    const estado = hechosHoy.get(h.id) === "hecho" ? "vacio" : "hecho";
    setLogs(prev => estado === "hecho"
      ? [...prev.filter(l => !(l.tareaId === h.id && l.fecha === hoy)), { tareaId: h.id, fecha: hoy, estado: "hecho" }]
      : prev.filter(l => !(l.tareaId === h.id && l.fecha === hoy)));
    const r = await api("/api/habitos/toggle", "POST", { tareaId: h.id, fecha: hoy, estado });
    if (estado === "hecho") setToast({ titulo: `🔥 ${h.nombre}`, lineas: [r.racha > 1 ? `Racha de ${r.racha} días. ¡Seguí así!` : "Primer día de la racha."] });
    setTareas(prev => prev?.map(t => (t.id === h.id ? { ...t, racha: r.racha } : t)) ?? prev);
  }

  async function completar(t: any) {
    const previo = t.estado;
    setTareas(prev => prev?.map(x => (x.id === t.id ? { ...x, estado: "Completada" } : x)) ?? prev);
    await api(`/api/tareas/${t.id}`, "PATCH", { estado: "Completada" });
    setToast({
      titulo: "✓ Tarea completada", lineas: [t.nombre],
      deshacer: async () => { await api(`/api/tareas/${t.id}`, "PATCH", { estado: previo }); cargar(); },
    });
  }

  async function capturar(modo: "tarea" | "idea") {
    const texto = captura.trim();
    if (!texto) return;
    setCaptura("");
    if (modo === "idea") {
      const n = await api("/api/notas", "POST", { texto, pantalla: "dashboard" });
      setToast({ titulo: "💡 Idea guardada", deshacer: async () => { await api(`/api/notas/${n.id}`, "DELETE"); cargar(); } });
    } else {
      const t = await api("/api/tareas", "POST", {
        nombre: texto, estado: "Sin empezar", epica: "Meta-sistema", tipo: "Tarea",
        caracterVisibilidad: "Relevante", prioridad: "Media", fechaVencimiento: hoyMediodiaISO(),
      });
      setToast({ titulo: "✓ Agregada a hoy", lineas: [texto], deshacer: async () => { await api(`/api/tareas/${t.id}`, "DELETE"); cargar(); } });
    }
    cargar();
  }

  async function ideaATarea(n: any) {
    await api("/api/tareas", "POST", { nombre: n.texto, estado: "Sin empezar", epica: "Meta-sistema", tipo: "Tarea", caracterVisibilidad: "Relevante", prioridad: "Media" });
    await api(`/api/notas/${n.id}`, "DELETE");
    setToast({ titulo: "✓ Idea pasada a Tareas" });
    cargar();
  }

  async function pedirCoach() {
    setCoachLoading(true); setCoachMsg("");
    guardarLocal("hoy-paso-coach", "1");
    try {
      const d = await api("/api/coach", "POST");
      setCoachMsg(d.respuesta || d.error || "Sin respuesta");
    } catch (e: any) { setCoachMsg(e.message); }
    setCoachLoading(false);
  }

  const porPilar = PILARES.map(p => {
    const deEste = (tareas ?? []).filter(t => pilarKey(t.epica) === p.key);
    const comp = deEste.filter(estaCompleta).length;
    return { ...p, total: deEste.length, pct: deEste.length ? Math.round((comp / deEste.length) * 100) : 0 };
  }).filter(p => p.total > 0);

  const f = ahora.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const fechaLarga = f.charAt(0).toUpperCase() + f.slice(1);
  const habHechos = habitos.filter(h => hechosHoy.get(h.id) === "hecho").length;

  return (
    <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, minHeight: 28 }}>{ahoraCliente ? `${saludo()}, Nacho` : ""}</h1>
        <div style={{ color: "var(--tx3)", fontSize: 13, minHeight: 18 }}>{ahoraCliente ? fechaLarga : ""}</div>
      </div>

      {(bloqueActual || bloqueProximo) && (() => {
        const b = bloqueActual ?? bloqueProximo;
        const k = pilarKey(b.pilar);
        return (
          <Link href="/cronograma" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card" style={{ padding: 12, background: `var(--${k}-b)`, borderColor: `var(--${k})`, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 22 }}>{bloqueActual ? "🕐" : "⏭"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: `var(--${k}-t)`, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{bloqueActual ? "Ahora" : "Después"}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{b.actividad}</div>
                <div style={{ fontSize: 12, color: "var(--tx2)" }}>{bloqueActual ? `hasta las ${b.horarioFin}` : `a las ${b.horarioInicio}`} · {b.pilar}</div>
              </div>
            </div>
          </Link>
        );
      })()}

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="text" value={captura} placeholder="Anotá algo que tenés que hacer..." onChange={e => setCaptura(e.target.value)}
            onKeyDown={e => e.key === "Enter" && capturar("tarea")} style={{ flex: 1, minWidth: 0, padding: "9px 12px" }} />
          <button className="primary" disabled={!captura.trim()} onClick={() => capturar("tarea")}>Para hoy</button>
          <button disabled={!captura.trim()} onClick={() => capturar("idea")} title="Guardar como idea">💡</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 6 }}>Enter la suma a hoy · 💡 la guarda como idea para después</div>
      </div>

      <PrimerosPasos settings={settings} cronograma={cronograma} habitos={habitos} />

      {autosUrgentes.length > 0 && (
        <Link href="/vehiculos" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card" style={{ padding: 12, borderColor: autosUrgentes.some(a => a.nivel === "urgente") ? "var(--red)" : "var(--amb)", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>🚗</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{autosUrgentes[0].titulo}{autosUrgentes.length > 1 ? ` y ${autosUrgentes.length - 1} más` : ""}</div>
              <div style={{ fontSize: 12, color: "var(--tx3)" }}>{autosUrgentes[0].alias} · {autosUrgentes[0].detalle}</div>
            </div>
            <span style={{ color: "var(--tx3)" }}>›</span>
          </div>
        </Link>
      )}

      <div className="vh-cols">
        <div className="card">
          <div className="seccion-titulo" style={{ margin: "0 0 6px" }}>
            <span>🔥 Hábitos de hoy</span>
            <span>{habitos.length ? `${habHechos}/${habitos.length}` : ""}</span>
          </div>
          {habitos.length > 0 && <div className="vh-progress" style={{ marginBottom: 6 }}><div style={{ width: `${(habHechos / habitos.length) * 100}%`, background: "var(--sal)" }} /></div>}
          {tareas && !habitos.length && (
            <div style={{ fontSize: 12, color: "var(--tx3)", padding: "6px 0" }}>Todavía no tenés hábitos. <Link href="/habitos" style={{ color: "var(--acc)" }}>Creá el primero</Link>.</div>
          )}
          {habitos.map(h => {
            const hecho = hechosHoy.get(h.id) === "hecho";
            const k = pilarKey(h.epica);
            return (
              <div key={h.id} className="fila" onClick={() => marcarHabito(h)} style={{ cursor: "pointer" }}>
                <button className={`check ${hecho ? "on" : ""}`} aria-label={hecho ? "Desmarcar" : "Marcar hecho"}>{hecho ? "✓" : ""}</button>
                <div style={{ flex: 1, minWidth: 0, textDecoration: hecho ? "line-through" : "none", color: hecho ? "var(--tx3)" : "var(--tx)" }}>
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: `var(--${k})`, marginRight: 6, verticalAlign: "middle" }} />
                  {h.nombre}
                </div>
                {h.racha > 0 && <span style={{ fontSize: 12, color: "var(--amb-t)", fontWeight: 600 }}>🔥{h.racha}</span>}
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="seccion-titulo" style={{ margin: "0 0 6px" }}>
            <span>✅ Para hoy</span>
            <Link href="/kanban" style={{ color: "var(--tx3)", textDecoration: "none" }}>Tareas ›</Link>
          </div>
          {tareas && !foco.length && (
            <div style={{ fontSize: 12, color: "var(--tx3)", padding: "6px 0" }}>Nada urgente para hoy. Anotá algo arriba o elegí de <Link href="/kanban" style={{ color: "var(--acc)" }}>Tareas</Link>.</div>
          )}
          {foco.map(t => {
            const v = venceInfo(t.fechaVencimiento);
            const k = pilarKey(t.epica);
            return (
              <div key={t.id} className="fila">
                <button className="check" onClick={() => completar(t)} aria-label="Completar" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{t.nombre}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                    {t.fechaVencimiento && <span className="tag" style={{ background: v.bg, color: `var(--${v.color})`, textTransform: "none" }}>{v.txt}</span>}
                    {String(t.estado).toLowerCase().includes("progreso") && <span className="tag" style={{ background: "var(--pro-b)", color: "var(--pro-t)", textTransform: "none" }}>en progreso</span>}
                    <span className="tag" style={{ background: `var(--${k}-b)`, color: `var(--${k}-t)`, textTransform: "none" }}>{PILARES.find(p => p.key === k)?.emoji}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {proximos.length > 0 && (
            <>
              <div className="seccion-titulo" style={{ margin: "12px 0 4px" }}><span>Próximos 7 días</span><Link href="/vencimientos" style={{ color: "var(--tx3)", textDecoration: "none" }}>Ver todo ›</Link></div>
              {proximos.slice(0, 4).map(({ t, v }) => (
                <div key={t.id} className="fila" style={{ fontSize: 12 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{t.nombre}</span>
                  <span className="tag" style={{ background: v.bg, color: `var(--${v.color})`, textTransform: "none" }}>{v.txt}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div className="seccion-titulo" style={{ margin: 0 }}><span>🧭 Señales</span></div>
          <button onClick={pedirCoach} disabled={coachLoading} className="primary" style={{ fontSize: 12, padding: "5px 12px" }}>
            {coachLoading ? "Pensando..." : "🤖 ¿Qué hago ahora?"}
          </button>
        </div>
        {senales.length === 0 && !coachMsg && <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 8 }}>Sin alertas. Si no sabés por dónde arrancar, preguntale al coach.</div>}
        {senales.map((s: any, i: number) => {
          const color = s.nivel === "alert" ? "red" : s.nivel === "warn" ? "amb" : "met";
          return (
            <div key={i} style={{ display: "flex", gap: 10, marginTop: 8, padding: 10, borderRadius: 8, background: `var(--${color}-b)` }}>
              <div style={{ fontSize: 18 }}>{s.emoji}</div>
              <div><div style={{ fontWeight: 600, color: `var(--${color}-t)` }}>{s.titulo}</div><div style={{ fontSize: 12, color: "var(--tx2)" }}>{s.texto}</div></div>
            </div>
          );
        })}
        {coachMsg && (
          <div style={{ marginTop: 10, padding: 12, background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--acc)", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5 }}>
            {coachMsg}
          </div>
        )}
      </div>

      <div className="card">
        <div className="seccion-titulo" style={{ margin: "0 0 6px" }}><span>💡 Ideas</span><span>{notas.length || ""}</span></div>
        {!notas.length && <div style={{ fontSize: 12, color: "var(--tx3)" }}>Lo que guardes con 💡 queda acá hasta que lo conviertas en tarea.</div>}
        {notas.map(n => (
          <div key={n.id} className="fila">
            <div style={{ flex: 1, minWidth: 0 }}>{n.texto}</div>
            <button onClick={() => ideaATarea(n)} style={{ fontSize: 11, padding: "3px 8px" }}>→ Tarea</button>
            <button onClick={async () => { await api(`/api/notas/${n.id}`, "DELETE"); cargar(); }} aria-label="Borrar"
              style={{ border: "none", background: "none", color: "var(--tx3)", padding: "0 4px" }}>✕</button>
          </div>
        ))}
      </div>

      {porPilar.length > 0 && (
        <details className="card vh-details">
          <summary className="seccion-titulo" style={{ margin: 0 }}><span>📊 Avance por pilar</span><span>›</span></summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginTop: 12 }}>
            {porPilar.map(p => (
              <Link key={p.key} href={`/kanban?pilar=${p.key}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ background: "var(--bg3)", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span>{p.emoji} {p.nombre}</span><span style={{ color: "var(--tx3)" }}>{p.pct}%</span>
                  </div>
                  <div className="vh-progress" style={{ height: 4 }}><div style={{ width: `${p.pct}%`, background: `var(--${p.key})` }} /></div>
                </div>
              </Link>
            ))}
          </div>
        </details>
      )}

      <Toast data={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
