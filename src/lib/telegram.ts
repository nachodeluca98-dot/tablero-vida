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

// Manda un mensaje con teclado inline (botones tappeables)
export async function sendTelegramWithButtons(
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>,
  chatId?: string
) {
  if (!TOKEN) return { ok: false };
  const id = chatId || DEFAULT_CHAT_ID;
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: id,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
    }),
  });
  return res.json();
}

// Responde un callback (cuando el usuario tappea un botón)
export async function answerCallback(callbackQueryId: string, text?: string) {
  if (!TOKEN) return;
  await fetch(`${API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

// Edita un mensaje existente (para refrescar la lista de hábitos tras tappear)
export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  buttons?: Array<Array<{ text: string; callback_data: string }>>
) {
  if (!TOKEN) return;
  await fetch(`${API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    }),
  });
}
