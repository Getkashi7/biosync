-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('SLEEP_HOURS', 'SLEEP_QUALITY', 'RESTING_HR', 'HRV', 'GLUCOSE', 'WEIGHT', 'HYDRATION', 'ENERGY', 'MOOD');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('MANUAL', 'HEALTH_CONNECT', 'APPLE_HEALTH', 'OURA', 'WHOOP', 'LIBRE');

-- CreateTable
CREATE TABLE "metrics" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "MetricType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" "MetricSource" NOT NULL DEFAULT 'MANUAL',
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "target_metric" "MetricType",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metrics_user_id_type_recorded_at_idx" ON "metrics"("user_id", "type", "recorded_at");

-- CreateIndex
CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

