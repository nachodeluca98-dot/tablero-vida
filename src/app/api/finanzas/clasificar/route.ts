import { NextResponse } from "next/server";
import { pendientesDeClasificar } from "@/lib/finanzas/movimientos";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await pendientesDeClasificar());
}
