-- CreateEnum
CREATE TYPE "StaffKind" AS ENUM ('PT', 'PRACTITIONER');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "staff_links" ADD COLUMN     "kind" "StaffKind";

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "StaffKind" NOT NULL,
    "status" "StaffStatus" NOT NULL DEFAULT 'PENDING',
    "credential" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_profiles_status_idx" ON "staff_profiles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_kind_key" ON "staff_profiles"("user_id", "kind");

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill `kind` from the legacy `role` column so no existing link is left
-- without a capacity. `role` stays for now and is dropped once nothing reads it.
UPDATE "staff_links" SET "kind" = 'PT'::"StaffKind"           WHERE "role" = 'PT'           AND "kind" IS NULL;
UPDATE "staff_links" SET "kind" = 'PRACTITIONER'::"StaffKind" WHERE "role" = 'PRACTITIONER' AND "kind" IS NULL;
