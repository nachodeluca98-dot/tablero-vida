import { NextRequest, NextResponse } from "next/server";
import { marcarPagados } from "@/lib/finanzas/revision";

export const dynamic = "force-dynamic";

// { anioMes, items: [{ itemId, monto? }] } → { pagados: [{ itemId, registroId }] } (Deshacer = DELETE /api/finanzas/registros)
export async function POST(req: NextRequest) {
  const b = await req.json();
  const items = (Array.isArray(b.items) ? b.items : []).filter((x: { itemId?: unknown }) => typeof x?.itemId === "string");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(b.anioMes))) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  return NextResponse.json(await marcarPagados(items, String(b.anioMes)));
}
