import { NextRequest, NextResponse } from "next/server";
import { anioMesActual } from "@/lib/finanzas/fechas";
import { actualizarRevision, datosRevision, iniciarRevision, type ModoRevision, type TipoRevision } from "@/lib/finanzas/revision";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const d = await datosRevision(req.nextUrl.searchParams.get("id") ?? "");
  return d ? NextResponse.json(d) : NextResponse.json({ error: "No encontré la revisión" }, { status: 404 });
}

// Empieza o retoma: { tipo, mes, modo? }. Sin modo solo retoma la que esté en curso ({ revision: null } si no hay).
export async function POST(req: NextRequest) {
  const b = await req.json();
  const tipo: TipoRevision = b.tipo === "cierre" ? "cierre" : "quincenal";
  const modo: ModoRevision | undefined = b.modo === "expres" ? "expres" : b.modo === "completo" ? "completo" : undefined;
  const mes = typeof b.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(b.mes) ? b.mes : anioMesActual();
  const r = await iniciarRevision(tipo, mes, modo);
  return NextResponse.json(r ? await datosRevision(r.id) : { revision: null });
}

// Avanzar de paso, completar o saltear: { id, paso? , completar?, saltear?, modo? }
export async function PATCH(req: NextRequest) {
  const b = await req.json();
  try {
    const r = await actualizarRevision(String(b.id), b);
    return NextResponse.json(await datosRevision(r.id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo" }, { status: 400 });
  }
}
