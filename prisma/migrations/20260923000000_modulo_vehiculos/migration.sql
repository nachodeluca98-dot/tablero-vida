-- CreateTable
CREATE TABLE "Vehiculo" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "anio" INTEGER,
    "patente" TEXT,
    "kmActual" INTEGER,
    "kmActualFecha" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "porDefecto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargaCombustible" (
    "id" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "litros" DOUBLE PRECISION NOT NULL,
    "montoTotal" DOUBLE PRECISION,
    "precioLitro" DOUBLE PRECISION,
    "odometro" INTEGER,
    "tanqueLleno" BOOLEAN NOT NULL DEFAULT true,
    "estacion" TEXT,
    "notas" TEXT,
    "fuente" TEXT NOT NULL DEFAULT 'formulario',
    "rawInput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CargaCombustible_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mantenimiento" (
    "id" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "odometro" INTEGER,
    "monto" DOUBLE PRECISION,
    "taller" TEXT,
    "descripcion" TEXT,
    "venceFecha" TIMESTAMP(3),
    "venceOdometro" INTEGER,
    "fuente" TEXT NOT NULL DEFAULT 'formulario',
    "rawInput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaMantenimiento" (
    "id" TEXT NOT NULL,
    "vehiculoId" TEXT,
    "tipo" TEXT NOT NULL,
    "cadaKm" INTEGER,
    "cadaMeses" INTEGER,
    "avisoKmAntes" INTEGER NOT NULL DEFAULT 500,
    "avisoDiasAntes" INTEGER NOT NULL DEFAULT 15,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReglaMantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordatorioVehiculo" (
    "id" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "enviadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canal" TEXT NOT NULL DEFAULT 'telegram',
    "estado" TEXT NOT NULL DEFAULT 'enviado',

    CONSTRAINT "RecordatorioVehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotPendiente" (
    "id" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotPendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CargaCombustible_vehiculoId_fecha_idx" ON "CargaCombustible"("vehiculoId", "fecha");

-- CreateIndex
CREATE INDEX "Mantenimiento_vehiculoId_tipo_fecha_idx" ON "Mantenimiento"("vehiculoId", "tipo", "fecha");

-- CreateIndex
CREATE INDEX "RecordatorioVehiculo_vehiculoId_tipo_enviadoAt_idx" ON "RecordatorioVehiculo"("vehiculoId", "tipo", "enviadoAt");

-- AddForeignKey
ALTER TABLE "CargaCombustible" ADD CONSTRAINT "CargaCombustible_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mantenimiento" ADD CONSTRAINT "Mantenimiento_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaMantenimiento" ADD CONSTRAINT "ReglaMantenimiento_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordatorioVehiculo" ADD CONSTRAINT "RecordatorioVehiculo_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reglas globales por defecto (editables desde /vehiculos)
INSERT INTO "ReglaMantenimiento" ("id", "vehiculoId", "tipo", "cadaKm", "cadaMeses") VALUES
  ('regla_default_aceite', NULL, 'aceite', 10000, 12),
  ('regla_default_service', NULL, 'service', 15000, 12),
  ('regla_default_neumaticos', NULL, 'neumaticos', 10000, NULL),
  ('regla_default_vtv', NULL, 'vtv', NULL, 12),
  ('regla_default_seguro', NULL, 'seguro', NULL, 12),
  ('regla_default_patente', NULL, 'patente', NULL, 3);
