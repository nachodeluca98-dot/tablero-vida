import { NextResponse } from "next/server";
import { pendientesVehiculos } from "@/lib/vehiculos/pendientes";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await pendientesVehiculos());
}
