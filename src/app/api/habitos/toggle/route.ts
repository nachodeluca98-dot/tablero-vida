import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Body: { tareaId, fecha: "YYYY-MM-DD" }
// Toggle: si existe el log lo borra, si no, lo crea.
export async function POST(req: NextRequest) {
  const { tareaId, fecha } = await req.json();
  if (!tareaId || !fecha) return NextResponse.json({ error: "tareaId y fecha requeridos" }, { status: 400 });

  const existing = await prisma.habitoLog.findUnique({ where: { tareaId_fecha: { tareaId, fecha } } });
  if (existing) {
    await prisma.habitoLog.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, hecho: false });
  } else {
    await prisma.habitoLog.create({ data: { tareaId, fecha } });
    return NextResponse.json({ ok: true, hecho: true });
  }
}
