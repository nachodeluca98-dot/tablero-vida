import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIPOS_MANT, fechaDesdeYmd } from "@/lib/vehiculos/core";

export const dynamic = "force-dynamic";

const NIVELES = new Set(["urgente", "importante", "relevante"]);

export async function PATCH(req: NextRequest, { params }: { params: { id: string; tid: string } }) {
  const b = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof b.titulo === "string" && b.titulo.trim()) data.titulo = b.titulo.trim().slice(0, 200);
  if ((TIPOS_MANT as readonly string[]).includes(b.tipo) && b.tipo !== "seguro") data.tipo = b.tipo;
  if (NIVELES.has(b.nivel)) data.nivel = b.nivel;
  if ("fecha" in b) data.fecha = b.fecha ? fechaDesdeYmd(b.fecha) : null;
  if ("notas" in b) data.notas = b.notas?.trim() || null;
  const r = await prisma.vehiculoTarea.updateMany({ where: { id: params.tid, vehiculoId: params.id }, data });
  if (!r.count) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string; tid: string } }) {
  await prisma.vehiculoTarea.deleteMany({ where: { id: params.tid, vehiculoId: params.id } });
  return NextResponse.json({ ok: true });
}
