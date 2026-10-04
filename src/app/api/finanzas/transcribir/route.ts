// Audio grabado en la app → texto, con el servicio de transcripción compartido (spec §11)
import { NextRequest, NextResponse } from "next/server";
import { transcribirAudio, transcripcionDisponible } from "@/lib/compartido/transcripcion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROMPT_FINANZAS = "Gastos: súper, lucas, mil pesos, dólares, verdes, cuotas, con la visa, débito, transferí, mercado pago, delivery, nafta.";

export async function POST(req: NextRequest) {
  if (!transcripcionDisponible()) {
    return NextResponse.json({ error: "La transcripción de voz no está configurada. Escribilo y lo interpreto igual.", sinServicio: true }, { status: 503 });
  }
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: "No llegó el audio" }, { status: 400 });
  const nombre = audio instanceof File && audio.name ? audio.name : "audio.webm";
  try {
    const texto = await transcribirAudio(audio, { nombreArchivo: nombre, prompt: PROMPT_FINANZAS });
    return NextResponse.json({ texto });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo transcribir" }, { status: 502 });
  }
}
