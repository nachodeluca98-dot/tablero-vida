import { NextRequest, NextResponse } from "next/server";
import { anioMesActual } from "@/lib/finanzas/fechas";
import { datosPresupuesto } from "@/lib/finanzas/presupuesto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const mes = req.nextUrl.searchParams.get("mes");
  return NextResponse.json(await datosPresupuesto(mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : anioMesActual()));
}
