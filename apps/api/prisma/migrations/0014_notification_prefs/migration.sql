-- CreateEnum
CREATE TYPE "NudgeType" AS ENUM ('CHECK_IN', 'MORNING_DIGEST', 'SUPPLEMENTS', 'HYDRATION', 'GOALS');

-- CreateTable
CREATE TABLE "notification_prefs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "quiet_start" TEXT NOT NULL DEFAULT '22:00',
    "quiet_end" TEXT NOT NULL DEFAULT '07:00',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_nudges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NudgeType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_nudges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_prefs_user_id_key" ON "notification_prefs"("user_id");

-- CreateIndex
CREATE INDEX "notification_nudges_user_id_idx" ON "notification_nudges"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_nudges_user_id_type_key" ON "notification_nudges"("user_id", "type");

-- AddForeignKey
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_nudges" ADD CONSTRAINT "notification_nudges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

