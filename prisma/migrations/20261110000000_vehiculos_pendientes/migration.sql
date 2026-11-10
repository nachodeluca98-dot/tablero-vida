-- AlterTable
ALTER TABLE "Vehiculo" ADD COLUMN     "kmManual" INTEGER,
ADD COLUMN     "kmManualFecha" TIMESTAMP(3);

-- La lectura actual queda como piso para no perder km al borrar registros
UPDATE "Vehiculo" SET "kmManual" = "kmActual", "kmManualFecha" = "kmActualFecha" WHERE "kmActual" IS NOT NULL;

-- CreateTable
CREATE TABLE "VehiculoTarea" (
    "id" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'reparacion',
    "nivel" TEXT NOT NULL DEFAULT 'importante',
    "fecha" TIMESTAMP(3),
    "notas" TEXT,
    "hecho" BOOLEAN NOT NULL DEFAULT false,
    "hechoAt" TIMESTAMP(3),
    "mantenimientoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehiculoTarea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehiculoTarea_vehiculoId_hecho_idx" ON "VehiculoTarea"("vehiculoId", "hecho");

-- AddForeignKey
ALTER TABLE "VehiculoTarea" ADD CONSTRAINT "VehiculoTarea_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Cambio de aceite cada 6.000 km (pedido del usuario); solo si sigue el valor de fábrica
UPDATE "ReglaMantenimiento" SET "cadaKm" = 6000 WHERE "id" = 'regla_default_aceite' AND "cadaKm" = 10000;
