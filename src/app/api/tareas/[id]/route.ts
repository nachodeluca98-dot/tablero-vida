import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const tarea = await prisma.tarea.findUnique({ where: { id: params.id }, include: { proyecto: true } });
  if (!tarea) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json(tarea);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const data = await req.json();
  const tarea = await prisma.tarea.update({ where: { id: params.id }, data });
  return NextResponse.json(tarea);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.tarea.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
