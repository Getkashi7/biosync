-- CreateEnum
CREATE TYPE "SupplementTiming" AS ENUM ('AM', 'PRE', 'PM');

-- CreateTable
CREATE TABLE "supplements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "timings" "SupplementTiming"[],
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "supplement_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "timing" "SupplementTiming" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplement_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplements_user_id_idx" ON "supplements"("user_id");

-- CreateIndex
CREATE INDEX "supplement_logs_user_id_date_idx" ON "supplement_logs"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "supplement_logs_supplement_id_date_timing_key" ON "supplement_logs"("supplement_id", "date", "timing");

-- AddForeignKey
ALTER TABLE "supplements" ADD CONSTRAINT "supplements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_supplement_id_fkey" FOREIGN KEY ("supplement_id") REFERENCES "supplements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

