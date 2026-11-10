// Marca un pendiente como resuelto hoy (desde el panel de pendientes)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIPOS_MANT, actualizarOdometro, fechaDesdeYmd } from "@/lib/vehiculos/core";
import { confirmarSeguroMes } from "@/lib/vehiculos/seguro";
import { feedbackMantenimiento } from "@/lib/vehiculos/feedback";
import { sincronizarMantenimiento } from "@/lib/finanzas/vehiculos";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  if (b.tipo === "seguro") {
    await confirmarSeguroMes(params.id);
    return NextResponse.json({ ok: true });
  }
  // Pendiente anotado por el usuario: se registra con su título y queda resuelto
  const tarea = b.tareaId
    ? await prisma.vehiculoTarea.findFirst({ where: { id: b.tareaId, vehiculoId: params.id, hecho: false } })
    : null;
  if (b.tareaId && !tarea) return NextResponse.json({ error: "Ese pendiente ya no existe" }, { status: 404 });
  if (tarea) b.tipo = tarea.tipo;
  if (!(TIPOS_MANT as readonly string[]).includes(b.tipo)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  const fecha = fechaDesdeYmd();
  const odometro = b.odometro === "" || b.odometro == null || isNaN(Number(b.odometro)) ? null : Math.round(Number(b.odometro));
  const monto = b.monto === "" || b.monto == null || isNaN(Number(b.monto)) ? null : Number(b.monto);
  const m = await prisma.mantenimiento.create({
    data: { vehiculoId: params.id, tipo: b.tipo, fecha, odometro, monto, descripcion: tarea?.titulo ?? "Marcado como hecho desde pendientes", taller: b.taller?.trim() || null, fuente: "formulario" },
  });
  if (tarea) {
    await prisma.vehiculoTarea.update({ where: { id: tarea.id }, data: { hecho: true, hechoAt: new Date(), mantenimientoId: m.id } });
  }
  await actualizarOdometro(params.id, odometro, fecha);
  await sincronizarMantenimiento(m.id);
  return NextResponse.json({ ok: true, id: m.id, kind: "mantenimiento", feedback: await feedbackMantenimiento(params.id, b.tipo) });
}
