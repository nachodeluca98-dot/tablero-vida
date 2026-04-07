import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const data = await req.json();
  const nota = await prisma.nota.update({ where: { id: params.id }, data });
  return NextResponse.json(nota);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.nota.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
