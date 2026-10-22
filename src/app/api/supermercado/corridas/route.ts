import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/lib/telegram";
import { autorizado } from "@/lib/supermercado/core";
import { ESTADOS_OK, mensajeCorrida, totalEstimado, type DetalleCorrida } from "@/lib/supermercado/corrida";

export const dynamic = "force-dynamic";

export async function GET() {
  const corridas = await prisma.superCorrida.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  return NextResponse.json(corridas);
}

// Reporte del script (scripts/coto-carrito.ts): se guarda y se avisa por Telegram
export async function POST(req: NextRequest) {
  if (!autorizado(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const b = await req.json();
  const detalle: DetalleCorrida[] = Array.isArray(b.detalle) ? b.detalle : [];
  const modo = b.modo === "solo_buscar" ? "solo_buscar" : "carrito";
  const error = b.error ? String(b.error).slice(0, 500) : null;
  const fallas = detalle.filter(d => !ESTADOS_OK.has(d.estado) && !(d.opcional && d.estado === "sin_resultados")).length;
  const estado = error && !detalle.length ? "error" : error || fallas ? "parcial" : "ok";
  const total = totalEstimado(detalle);
  const corrida = await prisma.superCorrida.create({ data: { modo, estado, total, detalle: detalle as any, error } });
  await sendTelegram(mensajeCorrida({ modo, detalle, error, total }));
  return NextResponse.json({ ok: true, id: corrida.id, estado });
}
