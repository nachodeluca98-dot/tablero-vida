import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const proyectos = await prisma.proyecto.findMany({ include: { tareas: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(proyectos);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const p = await prisma.proyecto.create({ data });
  return NextResponse.json(p, { status: 201 });
}
