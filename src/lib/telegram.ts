// Helper para interactuar con la API de Telegram Bot.
// Usa las variables de entorno TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const API = `https://api.telegram.org/bot${TOKEN}`;

export async function sendTelegram(text: string, chatId?: string) {
  if (!TOKEN) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN no configurado");
    return { ok: false, error: "no_token" };
  }
  const id = chatId || DEFAULT_CHAT_ID;
  if (!id) {
    console.warn("[telegram] TELEGRAM_CHAT_ID no configurado");
    return { ok: false, error: "no_chat_id" };
  }

  try {
    const res = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("[telegram] error enviando mensaje", err);
    return { ok: false, error: String(err) };
  }
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
