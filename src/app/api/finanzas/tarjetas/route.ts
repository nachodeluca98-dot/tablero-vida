import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await prisma.finTarjeta.findMany({ where: { activa: true }, orderBy: [{ esDefault: "desc" }, { createdAt: "asc" }] }));
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const nombre = String(b.nombre ?? "").trim().slice(0, 40);
  const diaCierre = Math.round(Number(b.diaCierre));
  if (!nombre) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 });
  if (!(diaCierre >= 1 && diaCierre <= 31)) return NextResponse.json({ error: "El día de cierre va de 1 a 31" }, { status: 400 });
  const hay = await prisma.finTarjeta.count({ where: { activa: true, esDefault: true } });
  return NextResponse.json(await prisma.finTarjeta.create({ data: { nombre, diaCierre, diaVencimiento: Number(b.diaVencimiento) || null, esDefault: hay === 0 } }));
}
