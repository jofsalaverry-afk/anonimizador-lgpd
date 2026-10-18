-- AlterTable
ALTER TABLE "Organizacao" ADD COLUMN     "encarregadoEmail" TEXT,
ADD COLUMN     "encarregadoNome" TEXT,
ADD COLUMN     "encarregadoTelefone" TEXT,
ADD COLUMN     "enderecoSede" TEXT,
ADD COLUMN     "faqPortal" JSONB,
ADD COLUMN     "uf" TEXT;

