import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { datosItem, siguienteOrden } from "@/lib/supermercado/core";

export const dynamic = "force-dynamic";

// ?activos=1 → solo lo que va al carrito (lo usa el script)
export async function GET(req: NextRequest) {
  const soloActivos = req.nextUrl.searchParams.get("activos") === "1";
  const items = await prisma.superItem.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { data, error } = datosItem(await req.json());
  if (error) return NextResponse.json({ error }, { status: 400 });
  const item = await prisma.superItem.create({ data: { ...(data as any), orden: await siguienteOrden() } });
  return NextResponse.json(item);
}
