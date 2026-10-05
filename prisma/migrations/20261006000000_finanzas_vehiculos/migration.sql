-- AlterTable
ALTER TABLE "fin_preferencias" ADD COLUMN     "vehiculos_importado_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "fin_registros_origen_ref_id_idx" ON "fin_registros"("origen_ref_id");

