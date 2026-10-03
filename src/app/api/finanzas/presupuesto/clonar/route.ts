import { NextRequest } from "next/server";
import { clonarDesdeAnterior } from "@/lib/finanzas/presupuesto";
import { conErrores } from "../errores";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await req.json();
  return conErrores(async () => ({ copiados: await clonarDesdeAnterior(String(b.anioMes), Number(b.ajusteInflacionPct) || 0) }));
}
