import { NextRequest, NextResponse } from "next/server";
import type { Borrador } from "@/lib/finanzas/borrador";
import { deshacerRegistros, guardarBorradores, marcarDuplicados, type Origen } from "@/lib/finanzas/carga";

export const dynamic = "force-dynamic";

const ORIGENES: Origen[] = ["app_voz", "app_rapida", "app_formulario"];

// Guarda uno o varios borradores. Devuelve los ids (para Deshacer) y avisos de posible duplicado.
export async function POST(req: NextRequest) {
  const b = (await req.json()) as { borradores?: Borrador[]; origen?: Origen; transcripcion?: string; chequearDuplicados?: boolean };
  const borradores = (b.borradores || []).filter((x) => x && x.monto != null && Number(x.monto) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha));
  if (!borradores.length) return NextResponse.json({ error: "No hay nada para guardar: falta el monto." }, { status: 400 });
  const origen = ORIGENES.includes(b.origen as Origen) ? (b.origen as Origen) : "app_formulario";

  // En carga rápida no hay tarjeta previa donde avisar: el aviso viene en la respuesta
  const avisos = b.chequearDuplicados ? (await marcarDuplicados(borradores)).flatMap((x) => (x.duplicado ? [x.duplicado] : [])) : [];
  const res = await guardarBorradores(borradores.map((x) => ({ ...x, monto: Number(x.monto) })), origen, b.transcripcion);
  return NextResponse.json({ ...res, avisos });
}

export async function DELETE(req: NextRequest) {
  const { ids } = (await req.json()) as { ids?: string[] };
  const borrados = await deshacerRegistros(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
  return NextResponse.json({ borrados });
}
