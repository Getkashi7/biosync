-- CreateEnum
CREATE TYPE "StaffLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "staff_links" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "StaffLinkStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_links_staff_id_status_idx" ON "staff_links"("staff_id", "status");

-- CreateIndex
CREATE INDEX "staff_links_client_id_status_idx" ON "staff_links"("client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_links_client_id_staff_id_role_key" ON "staff_links"("client_id", "staff_id", "role");

-- AddForeignKey
ALTER TABLE "staff_links" ADD CONSTRAINT "staff_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_links" ADD CONSTRAINT "staff_links_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

