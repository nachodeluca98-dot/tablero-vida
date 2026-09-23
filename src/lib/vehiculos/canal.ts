// Adaptador de canal de avisos: hoy Telegram. Para sumar WhatsApp o mail, se cambia solo acá.
import { sendTelegramWithButtons } from "@/lib/telegram";

type Boton = { text: string; callback_data: string };

export async function notificar(texto: string, botones: Boton[][] = []) {
  return sendTelegramWithButtons(texto, botones);
}
