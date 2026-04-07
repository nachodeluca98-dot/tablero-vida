// Llamar UNA VEZ para registrar el webhook en Telegram.
// GET https://tablero-vida.vercel.app/api/telegram/setup

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) return NextResponse.json({ ok: false, error: "no_token" }, { status: 500 });

  const url = new URL(req.url);
  const host = `${url.protocol}//${url.host}`;
  const webhookUrl = `${host}/api/telegram/webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
  );
  const data = await res.json();
  return NextResponse.json({ webhookUrl, telegram: data });
}
