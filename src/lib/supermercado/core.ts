import { prisma } from "@/lib/prisma";

const CRITERIOS = new Set(["primero", "mas_barato"]);
const UNIDADES = new Set(["un", "kg"]);

// Normaliza el body de alta/edición de un ítem; devuelve error si falta algo
export function datosItem(b: any, parcial = false): { data?: Record<string, unknown>; error?: string } {
  const d: Record<string, unknown> = {};
  if (b.nombre !== undefined || !parcial) {
    if (!String(b.nombre ?? "").trim()) return { error: "Poné un nombre" };
    d.nombre = String(b.nombre).trim();
  }
  if (b.busquedas !== undefined) {
    const l = (Array.isArray(b.busquedas) ? b.busquedas : String(b.busquedas).split("\n")).map((s: unknown) => String(s).trim()).filter(Boolean);
    d.busquedas = l;
  } else if (!parcial) d.busquedas = [String(b.nombre).trim()];
  if (b.criterio !== undefined) {
    if (!CRITERIOS.has(b.criterio)) return { error: "Criterio inválido" };
    d.criterio = b.criterio;
  }
  if (b.unidad !== undefined) {
    if (!UNIDADES.has(b.unidad)) return { error: "Unidad inválida" };
    d.unidad = b.unidad;
  }
  if (b.cantidad !== undefined) {
    const n = Number(String(b.cantidad).replace(",", "."));
    if (!(n > 0)) return { error: "La cantidad tiene que ser mayor a 0" };
    d.cantidad = n;
  }
  for (const k of ["opcional", "activo"]) if (b[k] !== undefined) d[k] = !!b[k];
  for (const k of ["cotoUrl", "cotoNombre", "notas"]) if (b[k] !== undefined) d[k] = String(b[k] ?? "").trim() || null;
  if (b.orden !== undefined) d.orden = parseInt(b.orden) || 0;
  return { data: d };
}

export async function siguienteOrden() {
  const ult = await prisma.superItem.findFirst({ orderBy: { orden: "desc" }, select: { orden: true } });
  return (ult?.orden ?? -1) + 1;
}

// El script de GitHub Actions se autentica con el mismo CRON_SECRET que usa Vercel Cron
export function autorizado(auth: string | null) {
  return !process.env.CRON_SECRET || auth === `Bearer ${process.env.CRON_SECRET}`;
}
