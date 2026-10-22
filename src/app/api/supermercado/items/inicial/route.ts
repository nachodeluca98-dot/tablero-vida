import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LISTA_INICIAL } from "@/lib/supermercado/lista-inicial";

export const dynamic = "force-dynamic";

// Precarga la lista habitual; solo si todavía no hay nada
export async function POST() {
  if (await prisma.superItem.count()) return NextResponse.json({ error: "La lista ya tiene productos" }, { status: 409 });
  await prisma.superItem.createMany({ data: LISTA_INICIAL.map((it, i) => ({ ...it, orden: i })) });
  return NextResponse.json({ ok: true, creados: LISTA_INICIAL.length });
}
