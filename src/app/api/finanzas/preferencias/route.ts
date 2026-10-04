import { NextRequest, NextResponse } from "next/server";
import { obtenerPreferencias } from "@/lib/finanzas/meses";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const salida = (p: Awaited<ReturnType<typeof obtenerPreferencias>>) => ({
  diasRevision: p.diasRevision,
  mostrarGuias: p.mostrarGuias,
  ajusteInflacionDefault: p.ajusteInflacionDefault?.toNumber() ?? null,
});

export async function GET() {
  return NextResponse.json(salida(await obtenerPreferencias()));
}

// { diasRevision?: number[] (0 = último día), mostrarGuias?: boolean }
export async function PATCH(req: NextRequest) {
  const b = await req.json();
  await obtenerPreferencias();
  const data: { diasRevision?: number[]; mostrarGuias?: boolean } = {};
  if (Array.isArray(b.diasRevision)) {
    const dias = Array.from(new Set(b.diasRevision.map((d: unknown) => Math.round(Number(d))).filter((d: number) => d >= 0 && d <= 28))) as number[];
    data.diasRevision = dias.sort((a, b) => (a || 99) - (b || 99));
  }
  if (typeof b.mostrarGuias === "boolean") data.mostrarGuias = b.mostrarGuias;
  return NextResponse.json(salida(await prisma.finPreferencias.update({ where: { id: "user" }, data })));
}
