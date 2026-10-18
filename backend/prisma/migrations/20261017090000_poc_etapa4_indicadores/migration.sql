-- CreateTable
CREATE TABLE "MetaIndicador" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "indicador" TEXT NOT NULL,
    "percentualMeta" INTEGER NOT NULL,
    "atualizadoPorId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaIndicador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotIndicadores" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "mesReferencia" TEXT NOT NULL,
    "valores" JSONB NOT NULL,
    "origem" TEXT NOT NULL,
    "geradoPorId" TEXT,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotIndicadores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaIndicador_organizacaoId_indicador_key" ON "MetaIndicador"("organizacaoId", "indicador");

-- CreateIndex
CREATE UNIQUE INDEX "SnapshotIndicadores_organizacaoId_mesReferencia_key" ON "SnapshotIndicadores"("organizacaoId", "mesReferencia");

-- AddForeignKey
ALTER TABLE "MetaIndicador" ADD CONSTRAINT "MetaIndicador_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotIndicadores" ADD CONSTRAINT "SnapshotIndicadores_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

