// Estado inicial del vehículo: últimos mantenimientos conocidos + cuota del seguro
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actualizarOdometro, fechaDesdeYmd } from "@/lib/vehiculos/core";
import { actualizarSeguro } from "@/lib/vehiculos/seguro";

export const dynamic = "force-dynamic";

const TIPOS = ["aceite", "service", "neumaticos", "correa", "vtv", "patente"] as const;
const entero = (x: unknown) => (x === "" || x == null || isNaN(Number(x)) ? null : Math.round(Number(x)));

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  const v = await prisma.vehiculo.findUnique({ where: { id: params.id } });
  if (!v) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const kmActual = entero(b.kmActual);
  if (kmActual != null) await actualizarOdometro(v.id, kmActual, fechaDesdeYmd());

  let creados = 0;
  for (const tipo of TIPOS) {
    const d = b[tipo];
    if (!d?.fecha) continue;
    const fecha = fechaDesdeYmd(d.fecha);
    const odometro = entero(d.km);
    await prisma.mantenimiento.create({
      data: {
        vehiculoId: v.id,
        tipo,
        fecha,
        odometro,
        venceFecha: d.vence ? fechaDesdeYmd(d.vence) : null,
        descripcion: "Cargado como estado inicial",
        fuente: "inicial",
      },
    });
    if (odometro != null) await actualizarOdometro(v.id, odometro, fecha);
    creados++;
  }

  const seguro = Number(b.seguro?.monto);
  if (seguro > 0) await actualizarSeguro(v.id, seguro, b.seguro?.compania?.trim() || null);

  return NextResponse.json({ ok: true, creados });
}
