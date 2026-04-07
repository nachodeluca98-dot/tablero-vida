import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Devuelve todos los logs (la data es chica). Front filtra por tarea y fecha.
export async function GET() {
  const logs = await prisma.habitoLog.findMany();
  return NextResponse.json(logs);
}
