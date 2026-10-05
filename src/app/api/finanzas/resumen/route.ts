import { NextRequest, NextResponse } from "next/server";
import { anioMesActual } from "@/lib/finanzas/fechas";
import { ErrorResumen, generarResumen, obtenerResumen, resumenDisponible } from "@/lib/finanzas/resumenIa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mes = (v: unknown) => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);

function periodo(d: unknown, h: unknown): [string, string] {
  const hasta = mes(h) ?? anioMesActual();
  const desde = mes(d) ?? hasta;
  return desde > hasta ? [hasta, hasta] : [desde, hasta];
}

// GET ?desde=YYYY-MM&hasta=YYYY-MM → resumen guardado del período (o null)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const [desde, hasta] = periodo(p.get("desde"), p.get("hasta"));
  return NextResponse.json({ resumen: await obtenerResumen(desde, hasta), disponible: resumenDisponible() });
}

// POST { desde, hasta } → genera (o regenera) el resumen del período
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const [desde, hasta] = periodo(b.desde, b.hasta);
  try {
    return NextResponse.json({ resumen: await generarResumen(desde, hasta), disponible: true });
  } catch (e) {
    if (e instanceof ErrorResumen) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
