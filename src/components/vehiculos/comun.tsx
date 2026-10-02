"use client";
import { useEffect } from "react";

// El seguro no va acá: se maneja como cuota mensual
export const TIPOS = ["reparacion", "aceite", "service", "neumaticos", "correa", "presion", "vtv", "patente", "otro"];
export const TIPO_LABEL: Record<string, string> = {
  service: "Service", aceite: "Aceite y filtro", neumaticos: "Neumáticos", correa: "Correa de distribución",
  presion: "Presión de neumáticos", vtv: "VTV", seguro: "Seguro", patente: "Patente", reparacion: "Reparación", otro: "Otro",
};
export const TIPO_EMOJI: Record<string, string> = {
  service: "🔧", aceite: "🛢️", neumaticos: "🛞", correa: "⚙️", presion: "🌬️", vtv: "📋", seguro: "🛡️", patente: "🧾", reparacion: "🔩", otro: "📌",
};
export const CATEGORIA: Record<string, string> = {
  aceite: "Mantenimiento", service: "Mantenimiento", neumaticos: "Mantenimiento", correa: "Mantenimiento", presion: "Mantenimiento",
  reparacion: "Reparaciones", otro: "Reparaciones",
  vtv: "Impuestos y seguro", seguro: "Impuestos y seguro", patente: "Impuestos y seguro",
};
export const CON_VENCIMIENTO = new Set(["vtv", "patente"]);
export const PIDE_KM = new Set(["aceite", "service", "neumaticos", "correa"]);
export const COLOR_ESTADO: Record<string, string> = { vencido: "red", proximo: "amb", ok: "sal", sin_datos: "met" };

export const km = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("es-AR"));
export const pesos = (n: number | null | undefined) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("es-AR"));
export const fecha = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }) : "—";
export const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
export const kmL = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1).replace(".", ","));

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

export function textoVenc(v: any) {
  if (v.estado === "sin_datos") return "Sin registro";
  const p: string[] = [];
  if (v.kmRestantes != null) p.push(v.kmRestantes < 0 ? `pasado ${km(-v.kmRestantes)} km` : `${km(v.kmRestantes)} km`);
  if (v.diasRestantes != null) p.push(v.diasRestantes < 0 ? `hace ${-v.diasRestantes} d` : v.diasRestantes === 0 ? "hoy" : `${v.diasRestantes} d`);
  return p.join(" · ");
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

export type ToastData = { titulo: string; lineas?: string[]; deshacer?: () => Promise<void> };

export function Toast({ data, onCerrar }: { data: ToastData | null; onCerrar: () => void }) {
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(onCerrar, data.deshacer ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [data, onCerrar]);
  if (!data) return null;
  return (
    <div className="vh-toast" role="status">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "var(--sal-t)" }}>{data.titulo}</div>
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

export function GraficoRendimiento({ puntos }: { puntos: any[] }) {
  if (puntos.length < 2) {
    return (
      <div style={{ color: "var(--tx3)", fontSize: 12 }}>
        Necesito al menos 3 cargas con tanque lleno y km para dibujar la evolución. Tip: cargá siempre hasta llenar y decí los km.
      </div>
    );
  }
  const W = 600, H = 150, P = 28;
  const ys = puntos.map(p => p.kmL);
  const min = Math.floor(Math.min(...ys) - 1), max = Math.ceil(Math.max(...ys) + 1);
  const x = (i: number) => P + (i * (W - 2 * P)) / (puntos.length - 1);
  const y = (v: number) => H - P - ((v - min) * (H - 2 * P)) / (max - min || 1);
  const d = puntos.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.kmL)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {[min, (min + max) / 2, max].map(v => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="var(--bd)" />
          <text x={2} y={y(v) + 4} fontSize="12" fill="var(--tx3)">{v.toFixed(0)}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--acc)" strokeWidth="2.5" />
      {puntos.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.kmL)} r="4" fill="var(--acc)">
          <title>{`${fecha(p.fecha)}: ${kmL(p.kmL)} km/L`}</title>
        </circle>
      ))}
    </svg>
  );
}
