import { NextRequest, NextResponse } from "next/server";
import { listarMovimientos } from "@/lib/finanzas/movimientos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return NextResponse.json(
    await listarMovimientos({
      mes: p.get("mes"),
      q: p.get("q"),
      categoria: p.get("categoria"),
      tipo: p.get("tipo"),
      medio: p.get("medio"),
      tarjeta: p.get("tarjeta"),
      sinClasificar: p.get("sinClasificar") === "1",
      aprox: p.get("aprox") === "1",
      compartido: p.get("compartido") === "1",
    })
  );
}
