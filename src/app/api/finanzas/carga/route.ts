import { NextResponse } from "next/server";
import { datosCarga } from "@/lib/finanzas/carga";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await datosCarga());
}
