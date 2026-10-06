import { NextRequest, NextResponse } from "next/server";
import { ErrorEdicion, editarMovimiento, obtenerMovimiento } from "@/lib/finanzas/movimientos";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const m = await obtenerMovimiento(params.id);
  return m ? NextResponse.json(m) : NextResponse.json({ error: "No encontrado" }, { status: 404 });
}

// Edición en el lugar: solo los campos que cambian
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json(await editarMovimiento(params.id, await req.json()));
  } catch (e) {
    if (e instanceof ErrorEdicion) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
