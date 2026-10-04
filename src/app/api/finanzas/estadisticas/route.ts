import { NextRequest, NextResponse } from "next/server";
import { datosEstadisticas } from "@/lib/finanzas/estadisticas";
import { anioMesActual } from "@/lib/finanzas/fechas";

export const dynamic = "force-dynamic";

const mes = (v: string | null) => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);

// ?desde=YYYY-MM&hasta=YYYY-MM (meses de imputación, inclusive)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const hasta = mes(p.get("hasta")) ?? anioMesActual();
  let desde = mes(p.get("desde")) ?? hasta;
  if (desde > hasta) desde = hasta;
  return NextResponse.json(await datosEstadisticas(desde, hasta));
}
