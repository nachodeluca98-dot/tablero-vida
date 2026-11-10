import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIPOS_MANT, fechaDesdeYmd } from "@/lib/vehiculos/core";
import { inferirTipo } from "@/lib/vehiculos/tipos";

export const dynamic = "force-dynamic";

const NIVELES = new Set(["urgente", "importante", "relevante"]);

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const tareas = await prisma.vehiculoTarea.findMany({
    where: { vehiculoId: params.id },
    orderBy: [{ hecho: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json(tareas);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  const titulo = String(b.titulo ?? "").trim();
  if (!titulo) return NextResponse.json({ error: "Escribí qué hay que hacer" }, { status: 400 });
  const tipo = (TIPOS_MANT as readonly string[]).includes(b.tipo) && b.tipo !== "seguro" ? b.tipo : inferirTipo(titulo);
  const t = await prisma.vehiculoTarea.create({
    data: {
      vehiculoId: params.id,
      titulo: titulo.slice(0, 200),
      tipo,
      nivel: NIVELES.has(b.nivel) ? b.nivel : "importante",
      fecha: b.fecha ? fechaDesdeYmd(b.fecha) : null,
      notas: b.notas?.trim() || null,
    },
  });
  return NextResponse.json(t, { status: 201 });
}
