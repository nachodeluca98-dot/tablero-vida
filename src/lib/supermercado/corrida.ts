import { escapeHtml } from "@/lib/telegram";

export type DetalleCorrida = {
  itemId: string;
  nombre: string;
  estado: "agregado" | "ya_estaba" | "elegido" | "sin_resultados" | "error" | "omitido";
  producto?: string | null;
  url?: string | null;
  precio?: number | null;
  cantidad?: number;
  unidad?: string;
  motivo?: string;
  opcional?: boolean;
  nota?: string | null;
};

export const ESTADOS_OK = new Set(["agregado", "ya_estaba", "elegido", "omitido"]);

const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const cant = (d: DetalleCorrida) => (d.unidad === "kg" ? `${d.cantidad} kg` : `x${d.cantidad}`);

export function totalEstimado(detalle: DetalleCorrida[]) {
  let t = 0;
  for (const d of detalle) if (d.precio && (d.estado === "agregado" || d.estado === "ya_estaba" || d.estado === "elegido")) t += d.precio * (d.cantidad || 1);
  return t || null;
}

export function mensajeCorrida(c: { modo: string; detalle: DetalleCorrida[]; error?: string | null; total: number | null }) {
  const L: string[] = [];
  const soloBuscar = c.modo === "solo_buscar";
  if (c.error && !c.detalle.length) {
    return `🛒 <b>No pude armar el carrito de Coto</b>\n${escapeHtml(c.error)}`;
  }
  const enCarrito = c.detalle.filter(d => d.estado === "agregado" || d.estado === "ya_estaba");
  L.push(soloBuscar ? `🔎 <b>Prueba de búsqueda en Coto</b> (no toqué el carrito)`
    : enCarrito.length ? `🛒 <b>Carrito de Coto listo</b>: ${enCarrito.length} productos`
    : `🛒 <b>No pude armar el carrito de Coto</b>`);
  if (c.total) L.push(`Total aprox.: <b>${pesos(c.total)}</b>`);
  L.push("");
  for (const d of c.detalle) {
    const prod = d.producto ? escapeHtml(d.producto) : "";
    const precio = d.precio ? ` · ${pesos(d.precio)}` : "";
    if (d.estado === "agregado" || d.estado === "elegido") L.push(`✅ ${prod} ${cant(d)}${precio}${d.motivo === "mas_barato" ? " <i>(la más barata)</i>" : d.motivo === "busqueda" ? " <i>(por búsqueda)</i>" : ""}`);
    else if (d.estado === "ya_estaba") L.push(`☑️ ${prod} ${cant(d)} <i>(ya estaba en el carrito)</i>`);
    else if (d.estado === "omitido") L.push(`➖ ${escapeHtml(d.nombre)}: no había`);
    else if (d.estado === "sin_resultados") L.push(`❌ ${escapeHtml(d.nombre)}: no lo encontré`);
    else L.push(`⚠️ ${escapeHtml(d.nombre)}: ${escapeHtml(d.nota || "no pude agregarlo")}`);
    if (d.nota && d.estado !== "error") L.push(`   <i>${escapeHtml(d.nota)}</i>`);
  }
  if (c.error) L.push("", `⚠️ ${escapeHtml(c.error)}`);
  if (!soloBuscar) L.push("", "Revisalo en la app de Coto y confirmá la compra.");
  return L.join("\n");
}
