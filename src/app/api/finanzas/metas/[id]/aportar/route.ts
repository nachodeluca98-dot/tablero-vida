import { NextRequest, NextResponse } from "next/server";
import { aportar, ErrorMeta } from "@/lib/finanzas/metas";

export const dynamic = "force-dynamic";

// { monto, moneda }: positivo = aporte (registro de ahorro), negativo = retiro
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  try {
    return NextResponse.json(await aportar(params.id, Number(b.monto), b.moneda === "USD" ? "USD" : "ARS"));
  } catch (e) {
    if (e instanceof ErrorMeta) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
