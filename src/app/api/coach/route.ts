import { NextResponse } from "next/server";
import { askCoach } from "@/lib/coach";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  try {
    const result = await askCoach();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
