import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resumenVehiculo } from "@/lib/vehiculos/core";
import { actualizarSeguro } from "@/lib/vehiculos/seguro";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const r = await resumenVehiculo(params.id);
  if (!r) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(r);
}

const EDITABLES = ["alias", "marca", "modelo", "anio", "patente", "activo", "porDefecto"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of EDITABLES) if (k in b) data[k] = b[k];
  if ("anio" in data) data.anio = data.anio ? parseInt(String(data.anio)) : null;
  if (data.porDefecto === true) {
    await prisma.vehiculo.updateMany({ data: { porDefecto: false } });
  }
  if ("seguroMensual" in b) {
    const monto = Number(b.seguroMensual);
    await actualizarSeguro(params.id, monto > 0 ? monto : null, "seguroCompania" in b ? b.seguroCompania?.trim() || null : undefined);
  }
  const v = await prisma.vehiculo.update({ where: { id: params.id }, data });
  return NextResponse.json(v);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.vehiculo.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
