-- CreateEnum
CREATE TYPE "SessionFeedback" AS ENUM ('TOO_HARD', 'JUST_RIGHT', 'TOO_EASY');

-- CreateTable
CREATE TABLE "fitness_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "intensity" INTEGER NOT NULL,
    "readiness" INTEGER,
    "rationale" TEXT NOT NULL,
    "rest" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "feedback" "SessionFeedback",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fitness_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fitness_sessions_user_id_date_idx" ON "fitness_sessions"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "fitness_sessions_user_id_date_key" ON "fitness_sessions"("user_id", "date");

-- AddForeignKey
ALTER TABLE "fitness_sessions" ADD CONSTRAINT "fitness_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

