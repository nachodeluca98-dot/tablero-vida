import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Body: { estado: string, ids: string[] }
// Actualiza orden (por index) y estado de todas las tareas de la lista.
export async function POST(req: NextRequest) {
  const { estado, ids } = await req.json();
  if (!Array.isArray(ids)) return NextResponse.json({ error: "ids requerido" }, { status: 400 });

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.tarea.update({
        where: { id },
        data: { orden: index, ...(estado ? { estado } : {}) },
      })
    )
  );
  return NextResponse.json({ ok: true, count: ids.length });
}
