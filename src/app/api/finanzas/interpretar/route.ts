// Dictado (o texto) → borradores editables. No guarda nada (spec §6.2).
import { NextRequest, NextResponse } from "next/server";
import { aBorradores, aParseado, contextoParser } from "@/lib/finanzas/carga";
import type { Borrador } from "@/lib/finanzas/borrador";
import { ErrorParser, parsearDictado, parserDisponible } from "@/lib/finanzas/parser";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { texto, lista } = (await req.json()) as { texto?: string; lista?: Borrador[] };
  if (!texto?.trim()) return NextResponse.json({ error: "No entendí nada. Probá de nuevo." }, { status: 400 });
  if (!parserDisponible()) {
    return NextResponse.json({ error: "La interpretación con IA no está configurada (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const contexto = await contextoParser();
  let listaActual;
  if (lista?.length) {
    const [tarjetas, metas] = await Promise.all([
      prisma.finTarjeta.findMany({ select: { id: true, nombre: true } }),
      prisma.finMeta.findMany({ select: { id: true, nombre: true } }),
    ]);
    listaActual = lista.map((b) => aParseado(b, tarjetas, metas));
  }

  try {
    const parseados = await parsearDictado(texto.trim(), contexto, listaActual);
    const borradores = await aBorradores(parseados);
    if (!borradores.length) {
      return NextResponse.json({ error: "No encontré ningún gasto en lo que dijiste.", texto }, { status: 422 });
    }
    return NextResponse.json({ borradores });
  } catch (e) {
    if (e instanceof ErrorParser) return NextResponse.json({ error: e.message, texto }, { status: 502 });
    throw e;
  }
}
