import { NextResponse } from "next/server";
import { ErrorPresupuesto } from "@/lib/finanzas/presupuesto";

// Errores de validación → 400 con el mensaje; el resto sigue de largo
export async function conErrores(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    if (e instanceof ErrorPresupuesto) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
