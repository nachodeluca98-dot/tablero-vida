import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// { nombre?, diaCierre?, diaVencimiento?, esDefault?: true, activa?: false }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  const data: { nombre?: string; diaCierre?: number; diaVencimiento?: number | null; esDefault?: boolean; activa?: boolean } = {};
  if (typeof b.nombre === "string" && b.nombre.trim()) data.nombre = b.nombre.trim().slice(0, 40);
  if (b.diaCierre !== undefined) {
    const d = Math.round(Number(b.diaCierre));
    if (!(d >= 1 && d <= 31)) return NextResponse.json({ error: "El día de cierre va de 1 a 31" }, { status: 400 });
    data.diaCierre = d;
  }
  if (b.diaVencimiento !== undefined) data.diaVencimiento = Number(b.diaVencimiento) || null;
  if (b.activa === false) data.activa = false;
  await prisma.$transaction(async (tx) => {
    // Una sola tarjeta default
    if (b.esDefault === true) {
      await tx.finTarjeta.updateMany({ where: { esDefault: true }, data: { esDefault: false } });
      data.esDefault = true;
    }
    if (b.activa === false) data.esDefault = false;
    await tx.finTarjeta.update({ where: { id: params.id }, data });
    // Si se dio de baja la default, pasa a la primera que quede
    if (b.activa === false && !(await tx.finTarjeta.count({ where: { activa: true, esDefault: true } }))) {
      const otra = await tx.finTarjeta.findFirst({ where: { activa: true }, orderBy: { createdAt: "asc" } });
      if (otra) await tx.finTarjeta.update({ where: { id: otra.id }, data: { esDefault: true } });
    }
  });
  return NextResponse.json(await prisma.finTarjeta.findMany({ where: { activa: true }, orderBy: [{ esDefault: "desc" }, { createdAt: "asc" }] }));
}
