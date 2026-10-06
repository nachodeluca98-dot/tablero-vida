import { NextRequest, NextResponse } from "next/server";
import { crearMeta, ErrorMeta, listarMetas } from "@/lib/finanzas/metas";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listarMetas());
}

export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(await crearMeta(await req.json()));
  } catch (e) {
    if (e instanceof ErrorMeta) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
