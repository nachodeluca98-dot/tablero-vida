// Audio de Telegram → texto. Usa Groq (Whisper, capa gratuita) si hay GROQ_API_KEY, si no OpenAI.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

function proveedor() {
  if (process.env.GROQ_API_KEY) {
    return {
      url: "https://api.groq.com/openai/v1/audio/transcriptions",
      key: process.env.GROQ_API_KEY,
      model: "whisper-large-v3-turbo",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      url: "https://api.openai.com/v1/audio/transcriptions",
      key: process.env.OPENAI_API_KEY,
      model: "whisper-1",
    };
  }
  return null;
}

export function transcripcionDisponible() {
  return proveedor() !== null;
}

export async function transcribirAudioTelegram(fileId: string): Promise<string> {
  const p = proveedor();
  if (!p) throw new Error("No hay GROQ_API_KEY ni OPENAI_API_KEY configurada");

  const info = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`).then(r => r.json());
  if (!info.ok) throw new Error("No pude obtener el audio de Telegram");
  const audio = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${info.result.file_path}`).then(r => r.arrayBuffer());

  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/ogg" }), "audio.ogg");
  form.append("model", p.model);
  form.append("language", "es");
  form.append("prompt", "Carga de nafta, litros, lucas, kilómetros, service, cambio de aceite, VTV.");

  const res = await fetch(p.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcripción falló (${res.status})`);
  const data = await res.json();
  return String(data.text || "").trim();
}
