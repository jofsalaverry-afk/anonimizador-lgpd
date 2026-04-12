-- CreateEnum
CREATE TYPE "Criticidade" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');

-- CreateEnum
CREATE TYPE "EvidenciaRequerida" AS ENUM ('DOCUMENTO', 'CAPTURA', 'AUTO_DECLARACAO', 'LINK_SISTEMA');

-- CreateEnum
CREATE TYPE "StatusResposta" AS ENUM ('CONFORME', 'PARCIAL', 'NAO_CONFORME', 'NAO_APLICAVEL');

-- CreateEnum
CREATE TYPE "TipoAlerta" AS ENUM ('DSAR_PRAZO', 'CHECKLIST_REVISAO', 'INCIDENTE_ABERTO', 'ROPA_DESATUALIZADO');

-- CreateTable
CREATE TABLE "ItemChecklist" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fundamentoLegal" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "criticidade" "Criticidade" NOT NULL,
    "evidenciaRequerida" "EvidenciaRequerida" NOT NULL,

    CONSTRAINT "ItemChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaChecklist" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "StatusResposta" NOT NULL,
    "observacao" TEXT,
    "evidenciaUrl" TEXT,
    "evidenciaHash" TEXT,
    "validadoPor" TEXT,
    "proximaRevisao" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RespostaChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaConformidade" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "tipo" "TipoAlerta" NOT NULL,
    "mensagem" TEXT NOT NULL,
    "criticidade" "Criticidade" NOT NULL,
    "lido" BOOLEAN NOT NULL DEFAULT false,
    "referenciaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertaConformidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemChecklist_codigo_key" ON "ItemChecklist"("codigo");

-- CreateIndex
CREATE INDEX "RespostaChecklist_organizacaoId_idx" ON "RespostaChecklist"("organizacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "RespostaChecklist_organizacaoId_itemId_key" ON "RespostaChecklist"("organizacaoId", "itemId");

-- CreateIndex
CREATE INDEX "AlertaConformidade_organizacaoId_lido_idx" ON "AlertaConformidade"("organizacaoId", "lido");

-- CreateIndex
CREATE INDEX "AlertaConformidade_organizacaoId_criadoEm_idx" ON "AlertaConformidade"("organizacaoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "RespostaChecklist" ADD CONSTRAINT "RespostaChecklist_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaChecklist" ADD CONSTRAINT "RespostaChecklist_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemChecklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaConformidade" ADD CONSTRAINT "AlertaConformidade_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
