import { NextRequest, NextResponse } from "next/server";
import { buscarCoto } from "@/lib/supermercado/coto";

export const dynamic = "force-dynamic";

// Lo mismo que devuelve la lupa de Coto, para probar una búsqueda antes de dejarla en la lista
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);
  try {
    return NextResponse.json(await buscarCoto(q, 8));
  } catch (e) {
    return NextResponse.json({ error: `No pude consultar Coto: ${String((e as Error).message || e)}` }, { status: 502 });
  }
}
