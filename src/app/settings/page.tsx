"use client";
import { useEffect, useState } from "react";
import PushToggle from "@/components/PushToggle";

export default function Settings() {
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { fetch("/api/settings").then(r => r.json()).then(setS); }, []);

  async function guardar() {
    setSaving(true);
    const r = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
    setS(await r.json());
    setSaving(false);
    setMsg("Guardado ✓");
    setTimeout(() => setMsg(""), 2000);
  }

  if (!s) return <div>Cargando...</div>;

  const field = (label: string, key: string, type: "text" | "time" | "number" = "text") => (
    <div>
      <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <input type={type} value={s[key] ?? ""} onChange={e => setS({ ...s, [key]: type === "number" ? Number(e.target.value) : e.target.value })} />
    </div>
  );

  const toggle = (label: string, key: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--bd)", cursor: "pointer" }}>
      <input type="checkbox" checked={!!s[key]} onChange={e => setS({ ...s, [key]: e.target.checked })} />
      <span style={{ flex: 1 }}>{label}</span>
    </label>
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Settings</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Horarios</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {field("Hora briefing", "horaBriefing", "time")}
          {field("Hora review", "horaReview", "time")}
          {field("Frecuencia sync (h)", "frecuenciaSync", "number")}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Automatizaciones</div>
        {toggle("Briefing matutino activo", "briefingActivo")}
        {toggle("Alertas de vencimiento", "alertasVencimiento")}
        {toggle("Push a Google Calendar", "pushCalendar")}
        {toggle("Resumen semanal dominical", "resumenSemanal")}
        {toggle("Alerta de sobrecarga", "alertaSobrecarga")}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Google Calendar</div>
        {s.googleCalendarConectado ? (
          <>
            <div style={{ marginBottom: 10, fontSize: 12 }}>
              <span style={{ color: "var(--sal-t)" }}>● Conectado</span>
              {s.googleEmail && <span style={{ color: "var(--tx3)", marginLeft: 8 }}>({s.googleEmail})</span>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button disabled={saving} onClick={async (e) => {
                (e.target as HTMLButtonElement).disabled = true;
                const r = await fetch("/api/google/bootstrap", { method: "POST" });
                const d = await r.json();
                alert(d.ok ? `Calendarios listos: ${Object.keys(d.calendars).length}` : `Error: ${d.error}`);
              }}>Crear 9 calendarios</button>
              <button onClick={async () => {
                const r = await fetch("/api/google/sync", { method: "POST" });
                const d = await r.json();
                alert(d.ok ? `Sync OK — creados ${d.creados}, actualizados ${d.actualizados}, saltados ${d.saltados} (total ${d.total})` : `Error: ${d.error}`);
              }}>Sync ahora</button>
              <button onClick={async (e) => {
                if (!confirm("Borrar TODOS los calendarios 'TV — ...' de Google y resetear. ¿Seguro?")) return;
                (e.target as HTMLButtonElement).disabled = true;
                const r = await fetch("/api/google/cleanup", { method: "POST" });
                const d = await r.json();
                alert(d.ok ? `Borrados: ${d.borrados}. Ahora podés crear los 9 de nuevo.` : `Error: ${d.error}`);
                (e.target as HTMLButtonElement).disabled = false;
              }} style={{ color: "var(--amb-t)" }}>Limpiar duplicados</button>
              <button onClick={async () => {
                const r = await fetch("/api/google/watch", { method: "POST" });
                const d = await r.json();
                alert(d.ok ? `Watch activado ✓ (expira ${new Date(+d.expiration).toLocaleString()})` : `Error: ${d.error}`);
              }}>Activar watch (sync en tiempo real)</button>
              <button onClick={async () => {
                if (!confirm("¿Desconectar Google?")) return;
                await fetch("/api/google/disconnect", { method: "POST" });
                const r = await fetch("/api/settings"); setS(await r.json());
              }} style={{ color: "var(--red-t)" }}>Desconectar</button>
            </div>
          </>
        ) : (
          <a href="/api/google/connect">
            <button className="primary">Conectar Google Calendar</button>
          </a>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🔔 Notificaciones push (este dispositivo)</div>
        <PushToggle />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Telegram</div>
        {toggle("Telegram conectado", "telegramConectado")}
        <div style={{ marginTop: 10 }}>{field("Telegram Chat ID", "telegramChatId")}</div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="primary" disabled={saving} onClick={guardar}>{saving ? "Guardando..." : "Guardar"}</button>
        {msg && <span style={{ color: "var(--sal-t)", fontSize: 12 }}>{msg}</span>}
      </div>
    </div>
  );
}
