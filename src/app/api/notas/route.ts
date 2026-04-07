import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const pantalla = req.nextUrl.searchParams.get("pantalla");
  const notas = await prisma.nota.findMany({
    where: pantalla ? { pantalla } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(notas);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const nota = await prisma.nota.create({ data });
  return NextResponse.json(nota, { status: 201 });
}
