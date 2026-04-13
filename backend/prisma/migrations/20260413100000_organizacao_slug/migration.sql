-- AlterTable
ALTER TABLE "Organizacao" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organizacao_slug_key" ON "Organizacao"("slug");
