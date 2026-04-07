"use client";
import { useEffect, useState } from "react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const ok = typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok) {
      navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setEnabled(!!sub);
      });
    }
  }, []);

  async function activar() {
    setBusy(true); setMsg("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMsg("Permiso denegado"); setBusy(false); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
      });
      setEnabled(true);
      setMsg("✓ Notificaciones activadas");
    } catch (e: any) {
      setMsg("Error: " + e.message);
    }
    setBusy(false);
  }

  async function desactivar() {
    setBusy(true); setMsg("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      setMsg("✓ Desactivadas");
    } catch (e: any) {
      setMsg("Error: " + e.message);
    }
    setBusy(false);
  }

  async function test() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/push/test", { method: "POST" });
    const data = await res.json();
    setMsg(data.ok ? `✓ Enviado a ${data.sent} dispositivo(s)` : "Error");
    setBusy(false);
  }

  if (!supported) {
    return <div style={{ color: "var(--tx3)", fontSize: 12 }}>Tu navegador no soporta push notifications.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!enabled ? (
          <button className="primary" onClick={activar} disabled={busy}>🔔 Activar notificaciones</button>
        ) : (
          <>
            <button onClick={desactivar} disabled={busy}>🔕 Desactivar</button>
            <button onClick={test} disabled={busy}>🧪 Enviar prueba</button>
          </>
        )}
      </div>
      {msg && <div style={{ fontSize: 12, color: "var(--tx2)" }}>{msg}</div>}
    </div>
  );
}
