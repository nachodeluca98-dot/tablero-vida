import { NextRequest } from "next/server";
import { editarItem } from "@/lib/finanzas/presupuesto";
import { conErrores } from "../../errores";

export const dynamic = "force-dynamic";

// Edición en el lugar. Quitar un ítem del mes = { activo: false } (se deshace con { activo: true }).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  return conErrores(() => editarItem(params.id, b));
}
