-- CreateTable
CREATE TABLE "fin_avisos" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "enviado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_avisos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fin_avisos_clave_key" ON "fin_avisos"("clave");

-- CreateIndex
CREATE INDEX "fin_avisos_tipo_enviado_at_idx" ON "fin_avisos"("tipo", "enviado_at");

