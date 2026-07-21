-- CreateTable
CREATE TABLE "training_plans" (
    "id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "week" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_notes" (
    "id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "shared_with_client" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_plans_client_id_idx" ON "training_plans"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_plans_trainer_id_client_id_week_key" ON "training_plans"("trainer_id", "client_id", "week");

-- CreateIndex
CREATE INDEX "session_notes_client_id_created_at_idx" ON "session_notes"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "session_notes_trainer_id_created_at_idx" ON "session_notes"("trainer_id", "created_at");

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

