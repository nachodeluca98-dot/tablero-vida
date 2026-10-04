import { NextResponse } from "next/server";
import { datosInicio } from "@/lib/finanzas/inicio";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await datosInicio());
}
