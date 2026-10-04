// Adaptador de canal de avisos: hoy Telegram. Para sumar WhatsApp o mail, se cambia solo acá.
import { sendTelegramWithButtons, type BotonTelegram } from "@/lib/telegram";

type Boton = BotonTelegram;

export async function notificar(texto: string, botones: Boton[][] = []) {
  return sendTelegramWithButtons(texto, botones);
}
