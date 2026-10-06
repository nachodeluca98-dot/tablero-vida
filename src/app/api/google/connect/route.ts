import { NextResponse } from "next/server";
import { authUrl } from "@/lib/google";

// Lee de la base: sin esto Next.js la congela en el build
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.redirect(authUrl());
}
