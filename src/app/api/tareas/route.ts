import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Lee de la base: sin esto Next.js la congela en el build
export const dynamic = "force-dynamic";

export async function GET() {
  const tareas = await prisma.tarea.findMany({ include: { proyecto: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(tareas);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const tarea = await prisma.tarea.create({ data });
  return NextResponse.json(tarea, { status: 201 });
}
