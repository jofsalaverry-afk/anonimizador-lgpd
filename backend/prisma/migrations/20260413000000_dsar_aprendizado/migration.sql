-- CreateTable
CREATE TABLE "DsarAprendizado" (
    "id" TEXT NOT NULL,
    "trecho" TEXT NOT NULL,
    "trechoNormalizado" TEXT NOT NULL,
    "classificacaoErrada" TEXT,
    "classificacaoCorreta" TEXT NOT NULL,
    "contexto" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DsarAprendizado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DsarAprendizado_trechoNormalizado_idx" ON "DsarAprendizado"("trechoNormalizado");
