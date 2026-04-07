import { NextResponse } from "next/server";
import { startWatch, stopWatch } from "@/lib/googleWatch";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const data = await startWatch();
    return NextResponse.json({ ok: true, expiration: data.expiration });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await stopWatch();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
