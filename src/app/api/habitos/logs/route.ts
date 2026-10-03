import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Lee de la base: sin esto Next.js la congela en el build
export const dynamic = "force-dynamic";

// Devuelve todos los logs (la data es chica). Front filtra por tarea y fecha.
export async function GET() {
  const logs = await prisma.habitoLog.findMany();
  return NextResponse.json(logs);
}
