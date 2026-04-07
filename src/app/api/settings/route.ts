import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let s = await prisma.settings.findUnique({ where: { id: "user" } });
  if (!s) s = await prisma.settings.create({ data: { id: "user" } });
  return NextResponse.json(s);
}

export async function PATCH(req: NextRequest) {
  const data = await req.json();
  const s = await prisma.settings.upsert({
    where: { id: "user" },
    update: data,
    create: { id: "user", ...data },
  });
  return NextResponse.json(s);
}
