-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "senhaAlteradaEm" TIMESTAMP(3),
ADD COLUMN     "senhaTrocaObrigatoria" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TokenRecuperacaoSenha" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenRecuperacaoSenha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenRecuperacaoSenha_tokenHash_key" ON "TokenRecuperacaoSenha"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenRecuperacaoSenha_usuarioId_idx" ON "TokenRecuperacaoSenha"("usuarioId");

