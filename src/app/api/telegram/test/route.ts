import { NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST() {
  const r = await sendTelegram("✅ <b>Prueba desde el Tablero de Vida</b>\nSi te llegó esto, los avisos funcionan. Mandá /ayuda para ver lo que puedo hacer.");
  if (!r?.ok) {
    const motivo = r?.error === "no_token" ? "Falta TELEGRAM_BOT_TOKEN en Vercel"
      : r?.error === "no_chat_id" ? "Falta TELEGRAM_CHAT_ID en Vercel"
      : r?.description || r?.error || "Telegram rechazó el mensaje";
    return NextResponse.json({ ok: false, error: motivo }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
