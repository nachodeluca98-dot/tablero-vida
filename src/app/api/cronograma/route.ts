import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Lee de la base: sin esto Next.js la congela en el build
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await prisma.cronogramaBase.findMany();
  return NextResponse.json(c);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const c = await prisma.cronogramaBase.create({ data });
  return NextResponse.json(c, { status: 201 });
}
