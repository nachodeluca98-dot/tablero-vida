import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Calcula racha actual basada en logs (solo "hecho" cuenta; "fallado" rompe)
async function recalcRacha(tareaId: string): Promise<number> {
  const logs = await prisma.habitoLog.findMany({
    where: { tareaId },
    orderBy: { fecha: "desc" },
  });
  const byFecha = new Map(logs.map(l => [l.fecha, l.estado]));

  let r = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Si hoy no se marcó, arrancamos desde ayer (tolerancia)
  if (!byFecha.has(ymd(d))) d.setDate(d.getDate() - 1);
  while (true) {
    const f = ymd(d);
    const estado = byFecha.get(f);
    if (estado === "hecho") { r++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return r;
}

// Body: { tareaId, fecha, estado?: "hecho"|"fallado"|"ciclar" }
// "ciclar" (default): vacío → hecho → fallado → vacío
export async function POST(req: NextRequest) {
  const { tareaId, fecha, estado } = await req.json();
  if (!tareaId || !fecha) return NextResponse.json({ error: "tareaId y fecha requeridos" }, { status: 400 });

  const existing = await prisma.habitoLog.findUnique({ where: { tareaId_fecha: { tareaId, fecha } } });

  let nuevoEstado: "vacio" | "hecho" | "fallado" = "hecho";

  if (estado === "hecho" || estado === "fallado") {
    nuevoEstado = estado;
  } else {
    // ciclar
    if (!existing) nuevoEstado = "hecho";
    else if (existing.estado === "hecho") nuevoEstado = "fallado";
    else nuevoEstado = "vacio";
  }

  if (nuevoEstado === "vacio") {
    if (existing) await prisma.habitoLog.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.habitoLog.update({ where: { id: existing.id }, data: { estado: nuevoEstado } });
  } else {
    await prisma.habitoLog.create({ data: { tareaId, fecha, estado: nuevoEstado } });
  }

  const racha = await recalcRacha(tareaId);
  await prisma.tarea.update({ where: { id: tareaId }, data: { racha } });

  return NextResponse.json({ ok: true, estado: nuevoEstado, racha });
}
