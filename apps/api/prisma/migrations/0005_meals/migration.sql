-- CreateTable
CREATE TABLE "meals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein_g" DOUBLE PRECISION NOT NULL,
    "carbs_g" DOUBLE PRECISION NOT NULL,
    "fat_g" DOUBLE PRECISION NOT NULL,
    "fiber_g" DOUBLE PRECISION,
    "estimated" BOOLEAN NOT NULL DEFAULT true,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meals_user_id_date_idx" ON "meals"("user_id", "date");

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

