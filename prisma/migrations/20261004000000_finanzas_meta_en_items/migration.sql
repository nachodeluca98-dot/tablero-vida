-- AlterTable
ALTER TABLE "fin_presupuesto_items" ADD COLUMN     "meta_id" TEXT;

-- AddForeignKey
ALTER TABLE "fin_presupuesto_items" ADD CONSTRAINT "fin_presupuesto_items_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "fin_metas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

