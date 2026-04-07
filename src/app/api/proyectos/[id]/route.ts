import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const p = await prisma.proyecto.findUnique({ where: { id: params.id }, include: { tareas: true } });
  if (!p) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(p);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const data = await req.json();
  const p = await prisma.proyecto.update({ where: { id: params.id }, data });
  return NextResponse.json(p);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.proyecto.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
