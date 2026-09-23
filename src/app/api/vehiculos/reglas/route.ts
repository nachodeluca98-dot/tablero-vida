import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const reglas = await prisma.reglaMantenimiento.findMany({ where: { vehiculoId: null }, orderBy: { tipo: "asc" } });
  return NextResponse.json(reglas);
}

const n = (x: unknown) => (x === "" || x == null ? null : parseInt(String(x)));

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const r = await prisma.reglaMantenimiento.update({
    where: { id: b.id },
    data: {
      cadaKm: n(b.cadaKm),
      cadaMeses: n(b.cadaMeses),
      avisoKmAntes: n(b.avisoKmAntes) ?? 500,
      avisoDiasAntes: n(b.avisoDiasAntes) ?? 15,
      activa: b.activa !== false,
    },
  });
  return NextResponse.json(r);
}
