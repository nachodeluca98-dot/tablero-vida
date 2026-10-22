import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { datosItem } from "@/lib/supermercado/core";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = datosItem(await req.json(), true);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const item = await prisma.superItem.update({ where: { id: params.id }, data: data as any }).catch(() => null);
  if (!item) return NextResponse.json({ error: "No existe ese producto" }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.superItem.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
