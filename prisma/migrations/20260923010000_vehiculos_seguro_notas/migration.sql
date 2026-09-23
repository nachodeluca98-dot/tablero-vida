-- AlterTable
ALTER TABLE "Vehiculo" ADD COLUMN     "seguroCompania" TEXT,
ADD COLUMN     "seguroMensual" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Mantenimiento" ADD COLUMN     "notas" TEXT;


-- El seguro pasa a ser una cuota mensual (Vehiculo.seguroMensual), no un vencimiento anual
UPDATE "ReglaMantenimiento" SET "activa" = false WHERE "tipo" = 'seguro';

-- Tipos nuevos: correa de distribución y control mensual de presión de neumáticos
INSERT INTO "ReglaMantenimiento" ("id", "vehiculoId", "tipo", "cadaKm", "cadaMeses", "avisoKmAntes", "avisoDiasAntes") VALUES
  ('regla_default_correa', NULL, 'correa', 60000, 48, 2000, 30),
  ('regla_default_presion', NULL, 'presion', NULL, 1, 500, 3);
