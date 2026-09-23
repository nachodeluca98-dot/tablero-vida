// Marca un pendiente como resuelto hoy (desde el panel de pendientes)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIPOS_MANT, actualizarOdometro, fechaDesdeYmd } from "@/lib/vehiculos/core";
import { confirmarSeguroMes } from "@/lib/vehiculos/seguro";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  if (b.tipo === "seguro") {
    await confirmarSeguroMes(params.id);
    return NextResponse.json({ ok: true });
  }
  if (!(TIPOS_MANT as readonly string[]).includes(b.tipo)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  const fecha = fechaDesdeYmd();
  const odometro = b.odometro === "" || b.odometro == null || isNaN(Number(b.odometro)) ? null : Math.round(Number(b.odometro));
  const monto = b.monto === "" || b.monto == null || isNaN(Number(b.monto)) ? null : Number(b.monto);
  await prisma.mantenimiento.create({
    data: { vehiculoId: params.id, tipo: b.tipo, fecha, odometro, monto, descripcion: "Marcado como hecho desde pendientes", fuente: "formulario" },
  });
  await actualizarOdometro(params.id, odometro, fecha);
  return NextResponse.json({ ok: true });
}
