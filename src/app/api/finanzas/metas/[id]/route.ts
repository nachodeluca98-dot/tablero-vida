import { NextRequest, NextResponse } from "next/server";
import { editarMeta } from "@/lib/finanzas/metas";

export const dynamic = "force-dynamic";

// { nombre?, montoObjetivo?, mesesCobertura?, fechaObjetivo?, icono?, activa?: false }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json(await editarMeta(params.id, await req.json()));
}
