// Seed 6 tareas puntuales bajo epica "Gestión Adulta" subepica "Capitalist"
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const tareas = [
  "Comprar y actualizar ropa",
  "Comprar decoración living",
  "Paneles acústicos",
  "Tatuaje",
  "Hacer feng shui casa",
  "Plan tareas domésticas",
];

async function main() {
  for (const nombre of tareas) {
    const exists = await prisma.tarea.findFirst({ where: { nombre, subepica: "Capitalist" } });
    if (exists) { console.log("ya existe:", nombre); continue; }
    await prisma.tarea.create({
      data: {
        nombre,
        epica: "Gestión Adulta",
        subepica: "Capitalist",
        tipo: "Tarea",
        estado: "Sin empezar",
        frecuencia: "Puntual",
        prioridad: "Media",
        caracterVisibilidad: "Relevante",
      },
    });
    console.log("creada:", nombre);
  }
}
main().finally(() => prisma.$disconnect());
