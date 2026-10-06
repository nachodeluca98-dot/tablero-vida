"use client";
import { useEffect, useState } from "react";
import PushToggle from "@/components/PushToggle";
import { PageHeader, Toast, type ToastData, api } from "@/components/ui";

const COMANDOS = [
  ["/hoy", "tareas y bloques de hoy"],
  ["/habitos", "marcar hábitos con botones"],
  ["/nueva <texto>", "crear una tarea rápida"],
  ["/vencimientos", "lo que vence en 7 días"],
  ["/estado", "estado de tus vehículos"],
  ["/coach", "una recomendación para ahora"],
];

export default function Ajustes() {
  const [s, setS] = useState<any>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [probando, setProbando] = useState(false);

  useEffect(() => { api("/api/settings").then(setS).catch(() => setS({})); }, []);

  async function patch(data: any, msg: string) {
    setS((p: any) => ({ ...p, ...data }));
    await api("/api/settings", "PATCH", data);
    setToast({ titulo: msg });
  }

  async function probarTelegram() {
    setProbando(true);
    try {
      await api("/api/telegram/test", "POST");
      setToast({ titulo: "✓ Mensaje enviado", lineas: ["Fijate en Telegram."] });
    } catch (e: any) {
      setToast({ titulo: "No se pudo enviar", lineas: [e.message], error: true });
    }
    setProbando(false);
  }

  async function google(accion: string, url: string, confirmar?: string) {
    if (confirmar && !confirm(confirmar)) return;
    try {
      const d = await api(url, "POST");
      if (d.ok === false) throw new Error(d.error || "Falló la operación");
      const msg = accion === "sync" ? `Creados ${d.creados}, actualizados ${d.actualizados}`
        : accion === "bootstrap" ? `${Object.keys(d.calendars ?? {}).length} calendarios listos`
        : accion === "watch" ? `Activo hasta ${new Date(+d.expiration).toLocaleDateString("es-AR")}`
        : accion === "cleanup" ? `Borrados: ${d.borrados}` : "";
      setToast({ titulo: "✓ Listo", lineas: msg ? [msg] : undefined });
      if (accion === "disconnect") setS(await api("/api/settings"));
    } catch (e: any) {
      setToast({ titulo: "Algo falló", lineas: [e.message], error: true });
    }
  }

  if (!s) return <div style={{ color: "var(--tx3)" }}>Cargando...</div>;

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
      <PageHeader titulo="Ajustes" sub="Avisos, notificaciones y conexiones" />

      <div className="card">
        <div className="card-title">📲 Telegram</div>
        <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 10, lineHeight: 1.5 }}>
          El bot te manda el <b>briefing a las 7:30</b>, la <b>review a las 22:00</b> y los avisos de vencimientos y del auto. También le podés escribir:
        </div>
        <div style={{ display: "grid", gap: 4, fontSize: 12, marginBottom: 12 }}>
          {COMANDOS.map(([c, d]) => (
            <div key={c}><code style={{ color: "var(--acc)" }}>{c}</code> <span style={{ color: "var(--tx3)" }}>— {d}</span></div>
          ))}
        </div>
        <button onClick={probarTelegram} disabled={probando}>{probando ? "Enviando..." : "Enviarme un mensaje de prueba"}</button>
      </div>

      <div className="card">
        <div className="card-title">☀️ Briefing de la mañana</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={s.briefingActivo !== false}
            onChange={e => patch({ briefingActivo: e.target.checked }, e.target.checked ? "Briefing activado" : "Briefing pausado")} />
          <span style={{ flex: 1 }}>
            Mandarme el resumen del día a las 7:30
            <div style={{ fontSize: 11, color: "var(--tx3)" }}>Si lo pausás, igual te llegan los avisos del auto y de vencimientos.</div>
          </span>
        </label>
      </div>

      <div className="card">
        <div className="card-title">🔔 Notificaciones en este dispositivo</div>
        <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 10 }}>Se activan por dispositivo: hacelo en el celular y en la compu si querés en los dos.</div>
        <PushToggle />
      </div>

      <div className="card">
        <div className="card-title">📅 Google Calendar</div>
        {s.googleCalendarConectado ? (
          <>
            <div style={{ marginBottom: 10, fontSize: 13 }}>
              <span style={{ color: "var(--sal-t)" }}>● Conectado</span>
              {s.googleEmail && <span style={{ color: "var(--tx3)", marginLeft: 8 }}>{s.googleEmail}</span>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="primary" onClick={() => google("sync", "/api/google/sync")}>Sincronizar ahora</button>
            </div>
            <details className="vh-details" style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 12, color: "var(--tx2)" }}>Opciones avanzadas ›</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, fontSize: 12 }}>
                <div><button onClick={() => google("bootstrap", "/api/google/bootstrap")}>Crear los 9 calendarios</button>
                  <div style={{ color: "var(--tx3)", marginTop: 3 }}>Un calendario por pilar. Solo hace falta la primera vez.</div></div>
                <div><button onClick={() => google("watch", "/api/google/watch")}>Activar sync en tiempo real</button>
                  <div style={{ color: "var(--tx3)", marginTop: 3 }}>Los cambios que hagas en Google se reflejan acá al instante. Se renueva solo cada mañana.</div></div>
                <div><button style={{ color: "var(--amb-t)" }} onClick={() => google("cleanup", "/api/google/cleanup", "Borra todos los calendarios \"TV — ...\" de Google. ¿Seguro?")}>Limpiar calendarios duplicados</button></div>
                <div><button style={{ color: "var(--red-t)" }} onClick={() => google("disconnect", "/api/google/disconnect", "¿Desconectar Google Calendar?")}>Desconectar</button></div>
              </div>
            </details>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 10 }}>Conectalo para ver tus tareas con fecha en el calendario del celular.</div>
            <a href="/api/google/connect"><button className="primary">Conectar Google Calendar</button></a>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">💡 Guías en pantalla</div>
        <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 10 }}>Volvé a mostrar los tips y los &quot;primeros pasos&quot; que ocultaste.</div>
        <button onClick={() => {
          try {
            Object.keys(localStorage).filter(k => k.startsWith("tip-") || k.includes("oculto") || k.startsWith("hoy-paso")).forEach(k => localStorage.removeItem(k));
          } catch {}
          setToast({ titulo: "✓ Guías restablecidas" });
        }}>Mostrar las guías de nuevo</button>
      </div>

      <Toast data={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
