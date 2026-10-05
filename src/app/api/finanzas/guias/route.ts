import { NextRequest, NextResponse } from "next/server";
import { celebrarHito, cerrarMarca, MARCAS, marcaPendiente, responderGuia, type MarcaId } from "@/lib/finanzas/adopcion";

export const dynamic = "force-dynamic";

const esMarca = (v: unknown): v is MarcaId => typeof v === "string" && v in MARCAS;

// GET ?marca=<pantalla> → { texto } si la marca de primera vez todavía no se vio (si no, texto null)
export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("marca");
  if (!esMarca(m)) return NextResponse.json({ error: "Marca desconocida" }, { status: 400 });
  return NextResponse.json({ texto: await marcaPendiente(m) });
}

// POST { guia, respuesta: completar|ahora_no|no_mostrar } | { marca } | { hito, anteriores? }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (typeof b.guia === "string" && ["completar", "ahora_no", "no_mostrar"].includes(b.respuesta)) {
    await responderGuia(b.guia, b.respuesta);
  } else if (esMarca(b.marca)) {
    await cerrarMarca(b.marca);
  } else if (typeof b.hito === "string" && b.hito.startsWith("hito:")) {
    await celebrarHito(b.hito, Array.isArray(b.anteriores) ? b.anteriores.filter((x: unknown): x is string => typeof x === "string") : []);
  } else {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
