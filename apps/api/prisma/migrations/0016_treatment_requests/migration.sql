-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateTable
CREATE TABLE "treatment_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "protocol_slug" TEXT NOT NULL,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_requests_user_id_status_idx" ON "treatment_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "treatment_requests_status_created_at_idx" ON "treatment_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "treatment_requests" ADD CONSTRAINT "treatment_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_requests" ADD CONSTRAINT "treatment_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

