"use client";
import { useEffect, useState } from "react";

export const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
export function leerLocal(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}
export function guardarLocal(clave: string, valor: string) {
  try { localStorage.setItem(clave, valor); } catch {}
}

export async function api(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Algo salió mal. Probá de nuevo.");
  return data;
}

export function Sheet({ abierto, onCerrar, titulo, children }: {
  abierto: boolean; onCerrar: () => void; titulo?: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <>
      <div className="vh-backdrop" onClick={onCerrar} />
      <div className="vh-sheet" role="dialog" aria-modal="true" aria-label={titulo}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{titulo}</div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "none", fontSize: 20, padding: "0 4px", color: "var(--tx3)" }}>✕</button>
        </div>
        {children}
      </div>
    </>
  );
}

export type ToastData = { titulo: string; lineas?: string[]; deshacer?: () => Promise<void>; error?: boolean };

export function Toast({ data, onCerrar }: { data: ToastData | null; onCerrar: () => void }) {
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(onCerrar, data.deshacer ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [data, onCerrar]);
  if (!data) return null;
  return (
    <div className="vh-toast" role={data.error ? "alert" : "status"} style={data.error ? { borderColor: "var(--red)" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: data.error ? "var(--red-t)" : "var(--sal-t)" }}>{data.titulo}</div>
          {data.lineas?.map(l => <div key={l} style={{ fontSize: 12, color: "var(--tx2)", marginTop: 3 }}>{l}</div>)}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {data.deshacer && (
            <button style={{ fontSize: 12, padding: "4px 10px" }} onClick={async () => { await data.deshacer!(); onCerrar(); }}>Deshacer</button>
          )}
          <button onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "none", color: "var(--tx3)", padding: "2px 4px" }}>✕</button>
        </div>
      </div>
    </div>
  );
}

export function Campo({ label, marcado, children, full }: { label: string; marcado?: boolean; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: "block", gridColumn: full ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 11, color: marcado ? "var(--red-t)" : "var(--tx3)", marginBottom: 4 }}>
        {label}{marcado ? " · revisar" : ""}
      </div>
      {children}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx3)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--tx2)", background: "var(--pro-b)", border: "1px solid rgba(56,189,248,.25)", borderRadius: 8, padding: "8px 10px" }}>
      <span>💡</span><span>{children}</span>
    </div>
  );
}


// Tip contextual que se puede cerrar; queda oculto en este dispositivo
export function TipBanner({ id, children }: { id: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(leerLocal(`tip-${id}`) !== "1"); }, [id]);
  if (!visible) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: "var(--tx2)", background: "var(--pro-b)",
      border: "1px solid rgba(56,189,248,.25)", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
      <span>💡</span>
      <div style={{ flex: 1 }}>{children}</div>
      <button onClick={() => { guardarLocal(`tip-${id}`, "1"); setVisible(false); }} aria-label="Entendido"
        style={{ border: "none", background: "none", color: "var(--pro-t)", padding: 0, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>Entendido</button>
    </div>
  );
}

export function PageHeader({ titulo, sub, children }: { titulo: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{titulo}</h1>
        {sub && <div style={{ color: "var(--tx3)", fontSize: 12, marginTop: 2 }}>{sub}</div>}
      </div>
      {children && <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

export function Chips<T extends string>({ opciones, valor, onChange }: {
  opciones: { key: T; label: React.ReactNode; color?: string }[]; valor: T; onChange: (v: T) => void;
}) {
  return (
    <div className="chips-scroll">
      {opciones.map(o => (
        <button key={o.key} className={`vh-chip ${valor === o.key ? "on" : ""}`} onClick={() => onChange(o.key)}
          style={o.color && valor !== o.key ? { borderLeft: `3px solid var(--${o.color})` } : undefined}>{o.label}</button>
      ))}
    </div>
  );
}

export const ymdLocal = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
