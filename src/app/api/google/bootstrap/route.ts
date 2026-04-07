import { NextResponse } from "next/server";
import { bootstrapCalendars } from "@/lib/google";

export async function POST() {
  try {
    const map = await bootstrapCalendars();
    return NextResponse.json({ ok: true, calendars: map });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
