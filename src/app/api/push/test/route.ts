import { NextResponse } from "next/server";
import { sendPushToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await sendPushToAll({
    title: "🧭 Tablero de Vida",
    body: "Push notification de prueba — ¡funciona!",
    url: "/",
    tag: "test",
  });
  return NextResponse.json(result);
}
