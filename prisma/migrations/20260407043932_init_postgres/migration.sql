-- CreateTable
CREATE TABLE "Tarea" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Sin empezar',
    "epica" TEXT,
    "subepica" TEXT,
    "tipo" TEXT,
    "frecuencia" TEXT,
    "prioridad" TEXT,
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "duracionMin" INTEGER,
    "diasPreferidos" TEXT,
    "horario" TEXT,
    "alerta" BOOLEAN NOT NULL DEFAULT false,
    "diasAnticipacion" INTEGER,
    "racha" INTEGER NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "caracterVisibilidad" TEXT NOT NULL DEFAULT 'Relevante',
    "mostrarEnHabitos" BOOLEAN NOT NULL DEFAULT true,
    "energia" TEXT,
    "notas" TEXT,
    "proyectoId" TEXT,
    "googleEventId" TEXT,
    "googleCalendarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proyecto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Sin empezar',
    "epica" TEXT,
    "tipoProyecto" TEXT,
    "avance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fechaInicio" TIMESTAMP(3),
    "fechaLimite" TIMESTAMP(3),
    "plataforma" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitoLog" (
    "id" TEXT NOT NULL,
    "tareaId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitoLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronogramaBase" (
    "id" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "bloque" TEXT NOT NULL,
    "actividad" TEXT NOT NULL,
    "pilar" TEXT NOT NULL,
    "horarioInicio" TEXT NOT NULL,
    "horarioFin" TEXT NOT NULL,

    CONSTRAINT "CronogramaBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "pantalla" TEXT NOT NULL,
    "convertida" BOOLEAN NOT NULL DEFAULT false,
    "tareaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'user',
    "horaBriefing" TEXT NOT NULL DEFAULT '07:30',
    "horaReview" TEXT NOT NULL DEFAULT '22:00',
    "frecuenciaSync" INTEGER NOT NULL DEFAULT 6,
    "briefingActivo" BOOLEAN NOT NULL DEFAULT true,
    "alertasVencimiento" BOOLEAN NOT NULL DEFAULT true,
    "pushCalendar" BOOLEAN NOT NULL DEFAULT true,
    "resumenSemanal" BOOLEAN NOT NULL DEFAULT true,
    "alertaSobrecarga" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarConectado" BOOLEAN NOT NULL DEFAULT false,
    "telegramConectado" BOOLEAN NOT NULL DEFAULT false,
    "telegramChatId" TEXT,
    "googleAccessToken" TEXT,
    "googleRefreshToken" TEXT,
    "googleTokenExpiry" TIMESTAMP(3),
    "googleCalendarsJson" TEXT,
    "googleEmail" TEXT,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HabitoLog_tareaId_fecha_key" ON "HabitoLog"("tareaId", "fecha");

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitoLog" ADD CONSTRAINT "HabitoLog_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
