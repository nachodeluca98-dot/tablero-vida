import { NextRequest } from "next/server";
import { borrarReasignacion, reasignar } from "@/lib/finanzas/presupuesto";
import { conErrores } from "../errores";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await req.json();
  return conErrores(() => reasignar(String(b.anioMes), String(b.origen), String(b.destino), Number(b.monto)));
}

// Deshacer una reasignación
export async function DELETE(req: NextRequest) {
  const { ids } = await req.json();
  return conErrores(async () => ({ borrados: await borrarReasignacion(Array.isArray(ids) ? ids : []) }));
}
