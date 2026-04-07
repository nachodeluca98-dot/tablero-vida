import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const ROOT = path.resolve(__dirname, "..", "..");
const TAREAS_CSV = path.join(ROOT, "tareas_final.csv");
const PROYECTOS_CSV = path.join(ROOT, "proyectos_notion_v3 (PARA AJUSTAR).csv");

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function parseInt0(s?: string): number | null {
  if (!s) return null;
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? null : n;
}

function parseBool(s?: string): boolean {
  if (!s) return false;
  const t = s.trim().toLowerCase();
  return t === "sí" || t === "si" || t === "true" || t === "1" || t === "yes";
}

function parseFloat0(s?: string): number {
  if (!s) return 0;
  const cleaned = s.replace("%", "").replace(",", ".").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Cronograma base del plan técnico
const CRONOGRAMA = [
  // Lun
  { dia: "Lun", bloque: "AM", actividad: "Work", pilar: "Profesional", horarioInicio: "09:00", horarioFin: "17:30" },
  { dia: "Lun", bloque: "Main", actividad: "Train", pilar: "Actividad física", horarioInicio: "17:30", horarioFin: "21:00" },
  { dia: "Lun", bloque: "Rest", actividad: "Baño+Prote+Cook", pilar: "Nutrición y salud", horarioInicio: "21:00", horarioFin: "22:30" },
  { dia: "Lun", bloque: "Final", actividad: "Pili/Acro", pilar: "Actividad física", horarioInicio: "22:30", horarioFin: "01:00" },
  // Mar
  { dia: "Mar", bloque: "AM", actividad: "Work", pilar: "Profesional", horarioInicio: "09:00", horarioFin: "17:30" },
  { dia: "Mar", bloque: "Main", actividad: "Canto", pilar: "Música", horarioInicio: "17:30", horarioFin: "21:00" },
  { dia: "Mar", bloque: "Rest", actividad: "Adult gestiones", pilar: "Gestión adulta", horarioInicio: "21:00", horarioFin: "22:30" },
  { dia: "Mar", bloque: "Final", actividad: "Free", pilar: "Social", horarioInicio: "22:30", horarioFin: "01:00" },
  // Mie
  { dia: "Mie", bloque: "AM", actividad: "Work", pilar: "Profesional", horarioInicio: "09:00", horarioFin: "17:30" },
  { dia: "Mie", bloque: "Main", actividad: "Train", pilar: "Actividad física", horarioInicio: "17:30", horarioFin: "21:00" },
  { dia: "Mie", bloque: "Rest", actividad: "Baño+Prote+Cook", pilar: "Nutrición y salud", horarioInicio: "21:00", horarioFin: "22:30" },
  { dia: "Mie", bloque: "Final", actividad: "Pili/Acro", pilar: "Actividad física", horarioInicio: "22:30", horarioFin: "01:00" },
  // Jue
  { dia: "Jue", bloque: "AM", actividad: "Work+Viaje", pilar: "Profesional", horarioInicio: "09:00", horarioFin: "17:30" },
  { dia: "Jue", bloque: "Main", actividad: "Canto", pilar: "Música", horarioInicio: "17:30", horarioFin: "21:00" },
  { dia: "Jue", bloque: "Rest", actividad: "Free", pilar: "Social", horarioInicio: "21:00", horarioFin: "22:30" },
  { dia: "Jue", bloque: "Final", actividad: "Peterson/Social", pilar: "Aprendizaje", horarioInicio: "22:30", horarioFin: "01:00" },
  // Vie
  { dia: "Vie", bloque: "AM", actividad: "Work", pilar: "Profesional", horarioInicio: "09:00", horarioFin: "17:30" },
  { dia: "Vie", bloque: "Main", actividad: "Train", pilar: "Actividad física", horarioInicio: "17:30", horarioFin: "21:00" },
  { dia: "Vie", bloque: "Rest", actividad: "Baño+Prote+Cook", pilar: "Nutrición y salud", horarioInicio: "21:00", horarioFin: "22:30" },
  { dia: "Vie", bloque: "Final", actividad: "Pili/Acro", pilar: "Actividad física", horarioInicio: "22:30", horarioFin: "01:00" },
  // Sab
  { dia: "Sab", bloque: "AM", actividad: "Train", pilar: "Actividad física", horarioInicio: "10:00", horarioFin: "13:00" },
  { dia: "Sab", bloque: "Main", actividad: "Acro", pilar: "Actividad física", horarioInicio: "14:00", horarioFin: "16:00" },
  { dia: "Sab", bloque: "Rest", actividad: "Write/Comp", pilar: "Creator/divulgación", horarioInicio: "16:00", horarioFin: "20:00" },
  { dia: "Sab", bloque: "Final", actividad: "Free", pilar: "Social", horarioInicio: "20:00", horarioFin: "01:00" },
  // Dom
  { dia: "Dom", bloque: "AM", actividad: "Free/Pádel", pilar: "Social", horarioInicio: "10:00", horarioFin: "13:00" },
  { dia: "Dom", bloque: "Main", actividad: "Flia+Sol", pilar: "Social", horarioInicio: "13:00", horarioFin: "16:00" },
  { dia: "Dom", bloque: "Rest", actividad: "Rest", pilar: "Meta-sistema", horarioInicio: "16:00", horarioFin: "20:00" },
  { dia: "Dom", bloque: "Final", actividad: "Express+1a1/Kaizen", pilar: "Meta-sistema", horarioInicio: "20:00", horarioFin: "01:00" },
];

async function main() {
  console.log("🧹 Limpiando BD...");
  await prisma.tarea.deleteMany();
  await prisma.proyecto.deleteMany();
  await prisma.cronogramaBase.deleteMany();
  await prisma.nota.deleteMany();
  await prisma.settings.deleteMany();

  // Proyectos
  console.log("📁 Cargando proyectos...");
  const proyectosRaw = fs.readFileSync(PROYECTOS_CSV, "utf-8");
  const proyectos = parse(proyectosRaw, { columns: true, skip_empty_lines: true, trim: true }) as any[];
  const proyectosMap = new Map<string, string>(); // nombre -> id
  for (const p of proyectos) {
    const created = await prisma.proyecto.create({
      data: {
        nombre: p["Nombre"],
        estado: p["Estado"] || "Sin empezar",
        epica: p["Épica"] || null,
        tipoProyecto: p["Tipo"] || null,
        avance: parseFloat0(p["% Avance"]),
        plataforma: p["Plataforma"] || null,
        notas: p["Notas"] || null,
      },
    });
    proyectosMap.set(p["Nombre"], created.id);
  }
  console.log(`  ✓ ${proyectos.length} proyectos`);

  // Tareas
  console.log("✅ Cargando tareas...");
  const tareasRaw = fs.readFileSync(TAREAS_CSV, "utf-8");
  const tareas = parse(tareasRaw, { columns: true, skip_empty_lines: true, trim: true }) as any[];
  for (const t of tareas) {
    await prisma.tarea.create({
      data: {
        nombre: t["Nombre"],
        estado: t["Estado"] || "Sin empezar",
        epica: t["Épica"] || null,
        subepica: t["Subépica"] || null,
        tipo: t["Tipo"] || null,
        frecuencia: t["Frecuencia"] || null,
        prioridad: t["Prioridad"] || null,
        diasPreferidos: t["Días preferidos"] || null,
        horario: t["Horario"] || null,
        duracionMin: parseInt0(t["Duración (min)"]),
        alerta: parseBool(t["Alerta"]),
        diasAnticipacion: parseInt0(t["Días anticipación"]),
        energia: t["Energía"] || null,
        fechaInicio: parseDate(t["Fecha inicio"]),
        fechaFin: parseDate(t["Fecha fin"]),
        fechaVencimiento: parseDate(t["Fecha vencimiento"]),
        notas: t["Notas"] || null,
      },
    });
  }
  console.log(`  ✓ ${tareas.length} tareas`);

  // Cronograma
  console.log("📅 Cargando cronograma base...");
  await prisma.cronogramaBase.createMany({ data: CRONOGRAMA });
  console.log(`  ✓ ${CRONOGRAMA.length} bloques`);

  // Settings
  console.log("⚙️  Settings default...");
  await prisma.settings.create({ data: { id: "user" } });

  console.log("✨ Seed completo");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
