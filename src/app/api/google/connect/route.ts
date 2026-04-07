import { NextResponse } from "next/server";
import { authUrl } from "@/lib/google";

export async function GET() {
  return NextResponse.redirect(authUrl());
}
