-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "subject_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_subject_id_created_at_idx" ON "audit_logs"("subject_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

