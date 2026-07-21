-- CreateEnum
CREATE TYPE "ConsentCategory" AS ENUM ('BIOMETRICS', 'JOURNAL', 'DIAGNOSTICS', 'PHOTOS', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "ConsentAudience" AS ENUM ('NONE', 'TRAINER', 'PRACTITIONER');

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "ConsentCategory" NOT NULL,
    "audience" "ConsentAudience" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consents_user_id_idx" ON "consents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "consents_user_id_category_key" ON "consents"("user_id", "category");

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

