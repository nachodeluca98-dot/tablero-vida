import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIPOS_MANT, actualizarOdometro, fechaDesdeYmd, recalcularOdometro } from "@/lib/vehiculos/core";

export const dynamic = "force-dynamic";

const num = (x: unknown) => (x === "" || x == null ? null : Number(x));

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  const fecha = fechaDesdeYmd(b.fecha);
  const odometro = num(b.odometro);

  if (b.kind === "carga") {
    const litros = num(b.litros);
    if (!litros || litros <= 0) return NextResponse.json({ error: "Faltan los litros" }, { status: 400 });
    const monto = num(b.monto);
    const c = await prisma.cargaCombustible.create({
      data: {
        vehiculoId: params.id,
        fecha,
        litros,
        montoTotal: monto,
        precioLitro: monto ? monto / litros : null,
        odometro: odometro != null ? Math.round(odometro) : null,
        tanqueLleno: b.tanqueLleno !== false,
        fuente: "formulario",
      },
    });
    await actualizarOdometro(params.id, c.odometro, fecha);
    return NextResponse.json(c);
  }

  if (b.kind === "mantenimiento") {
    const tipo = (TIPOS_MANT as readonly string[]).includes(b.tipo) ? b.tipo : "otro";
    const m = await prisma.mantenimiento.create({
      data: {
        vehiculoId: params.id,
        tipo,
        fecha,
        odometro: odometro != null ? Math.round(odometro) : null,
        monto: num(b.monto),
        taller: b.taller || null,
        descripcion: b.descripcion || null,
        venceFecha: b.venceFecha ? fechaDesdeYmd(b.venceFecha) : null,
        fuente: "formulario",
      },
    });
    await actualizarOdometro(params.id, m.odometro, fecha);
    return NextResponse.json(m);
  }

  return NextResponse.json({ error: "kind inválido" }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const kind = req.nextUrl.searchParams.get("kind");
  const rid = req.nextUrl.searchParams.get("rid");
  if (!rid) return NextResponse.json({ error: "Falta rid" }, { status: 400 });
  if (kind === "carga") await prisma.cargaCombustible.deleteMany({ where: { id: rid, vehiculoId: params.id } });
  else if (kind === "mantenimiento") await prisma.mantenimiento.deleteMany({ where: { id: rid, vehiculoId: params.id } });
  else return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  await recalcularOdometro(params.id);
  return NextResponse.json({ ok: true });
}
