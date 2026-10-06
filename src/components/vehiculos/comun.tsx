"use client";

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
export const kmL = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1).replace(".", ","));

export function textoVenc(v: any) {
  if (v.estado === "sin_datos") return "Sin registro";
  const p: string[] = [];
  if (v.kmRestantes != null) p.push(v.kmRestantes < 0 ? `pasado ${km(-v.kmRestantes)} km` : `${km(v.kmRestantes)} km`);
  if (v.diasRestantes != null) p.push(v.diasRestantes < 0 ? `hace ${-v.diasRestantes} d` : v.diasRestantes === 0 ? "hoy" : `${v.diasRestantes} d`);
  return p.join(" · ");
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
