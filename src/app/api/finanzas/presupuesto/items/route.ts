import { NextRequest } from "next/server";
import { crearItem } from "@/lib/finanzas/presupuesto";
import { conErrores } from "../errores";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await req.json();
  return conErrores(() => crearItem(b));
}
