"use client";
// Grabación con MediaRecorder (spec §11): un toque para empezar, otro para terminar. Expone el nivel para dibujar la onda.
import { useCallback, useEffect, useRef, useState } from "react";

export type EstadoGrabadora = "inactiva" | "pidiendo" | "grabando" | "denegada" | "no_soportada";

const TIPOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function extensionDe(mime: string) {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function useGrabadora() {
  const [estado, setEstado] = useState<EstadoGrabadora>("inactiva");
  const [niveles, setNiveles] = useState<number[]>(() => Array(24).fill(0));
  const rec = useRef<MediaRecorder | null>(null);
  const partes = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const resolver = useRef<((b: Blob | null) => void) | null>(null);

  const limpiar = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    setNiveles(Array(24).fill(0));
  }, []);

  useEffect(() => () => {
    if (rec.current?.state === "recording") rec.current.stop();
    limpiar();
  }, [limpiar]);

  const empezar = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setEstado("no_soportada");
      return false;
    }
    setEstado("pidiendo");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setEstado("denegada");
      return false;
    }
    const mime = TIPOS.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    partes.current = [];
    r.ondataavailable = (e) => {
      if (e.data.size) partes.current.push(e.data);
    };
    r.onstop = () => {
      const blob = partes.current.length ? new Blob(partes.current, { type: r.mimeType || mime || "audio/webm" }) : null;
      limpiar();
      setEstado("inactiva");
      resolver.current?.(blob);
      resolver.current = null;
    };
    r.start();
    rec.current = r;
    setEstado("grabando");

    // Onda de audio
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx.current = new AC();
      const an = ctx.current.createAnalyser();
      an.fftSize = 64;
      ctx.current.createMediaStreamSource(stream.current).connect(an);
      const datos = new Uint8Array(an.frequencyBinCount);
      const paso = () => {
        an.getByteFrequencyData(datos);
        setNiveles(Array.from(datos.slice(0, 24), (v) => v / 255));
        raf.current = requestAnimationFrame(paso);
      };
      paso();
    } catch {}
    return true;
  }, [limpiar]);

  const terminar = useCallback(() => {
    return new Promise<Blob | null>((res) => {
      if (!rec.current || rec.current.state !== "recording") return res(null);
      resolver.current = res;
      rec.current.stop();
    });
  }, []);

  return { estado, niveles, empezar, terminar };
}
