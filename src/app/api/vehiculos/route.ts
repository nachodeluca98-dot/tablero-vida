import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resumenVehiculo } from "@/lib/vehiculos/core";

export const dynamic = "force-dynamic";

export async function GET() {
  const vehiculos = await prisma.vehiculo.findMany({ orderBy: [{ activo: "desc" }, { porDefecto: "desc" }, { createdAt: "asc" }] });
  const out = await Promise.all(vehiculos.map(async v => {
    const r = await resumenVehiculo(v.id);
    return {
      ...v,
      kmHoy: r?.kmHoy ?? null,
      rendimientoProm: r?.rendimientoProm ?? null,
      vencimientos: r?.vencimientos ?? [],
    };
  }));
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.alias?.trim()) return NextResponse.json({ error: "El alias es obligatorio" }, { status: 400 });
  const hayOtros = await prisma.vehiculo.count({ where: { activo: true } });
  const kmActual = b.kmActual ? parseInt(b.kmActual) : null;
  const v = await prisma.vehiculo.create({
    data: {
      alias: b.alias.trim(),
      marca: b.marca?.trim() || null,
      modelo: b.modelo?.trim() || null,
      anio: b.anio ? parseInt(b.anio) : null,
      patente: b.patente?.trim().toUpperCase() || null,
      kmActual,
      kmActualFecha: kmActual != null ? new Date() : null,
      porDefecto: hayOtros === 0,
    },
  });
  return NextResponse.json(v);
}
