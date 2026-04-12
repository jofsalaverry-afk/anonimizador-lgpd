-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ENCARREGADO_LGPD', 'GESTOR', 'OPERADOR', 'AUDITOR', 'TREINANDO');

-- CreateTable Organizacao
CREATE TABLE "Organizacao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "plano" TEXT NOT NULL DEFAULT 'basico',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoBase64" TEXT,
    "cabecalho" TEXT,
    "municipio" TEXT,
    "modulosAtivos" TEXT[] DEFAULT ARRAY['anonimizador']::TEXT[],

    CONSTRAINT "Organizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organizacao_cnpj_key" ON "Organizacao"("cnpj");

-- Migrate data: Camara → Organizacao (reusa mesmos IDs)
INSERT INTO "Organizacao" ("id", "nome", "cnpj", "ativo", "plano", "criadoEm", "logoBase64", "cabecalho", "municipio")
SELECT "id", "nome", "cnpj", "ativo", "plano", "criadoEm", "logoBase64", "cabecalho", "municipio"
FROM "Camara";

-- CreateTable Usuario
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'GESTOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoAcesso" TIMESTAMP(3),
    "organizacaoId" TEXT NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- Migrate data: Camara → Usuario (um usuario GESTOR por org, id = 'u_' + camaraId)
INSERT INTO "Usuario" ("id", "email", "senhaHash", "nome", "perfil", "ativo", "criadoEm", "ultimoAcesso", "organizacaoId")
SELECT 'u_' || "id", "email", "senhaHash", "nome", 'GESTOR', "ativo", "criadoEm", "ultimoAcesso", "id"
FROM "Camara";

-- AddForeignKey Usuario → Organizacao
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate Documento: rename camaraId → organizacaoId, add usuarioId
ALTER TABLE "Documento" DROP CONSTRAINT "Documento_camaraId_fkey";
ALTER TABLE "Documento" RENAME COLUMN "camaraId" TO "organizacaoId";
ALTER TABLE "Documento" ADD COLUMN "usuarioId" TEXT;

-- AddForeignKey Documento → Organizacao
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropTable Camara
DROP TABLE "Camara";
