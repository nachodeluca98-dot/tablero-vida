import { NextRequest, NextResponse } from "next/server";
import { estadoOnboarding, guardarPaso, irAPaso } from "@/lib/finanzas/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await estadoOnboarding());
}

// { paso, datos, saltear } guarda y avanza; { volverA } retrocede sin borrar nada
export async function POST(req: NextRequest) {
  const b = await req.json();
  try {
    if (b.volverA) return NextResponse.json(await irAPaso(b.volverA));
    return NextResponse.json(await guardarPaso(String(b.paso), b.datos, !!b.saltear));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}
