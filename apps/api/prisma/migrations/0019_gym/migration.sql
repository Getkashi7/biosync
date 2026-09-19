-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CheckInSource" AS ENUM ('QR', 'MANUAL', 'STAFF');

-- CreateTable
CREATE TABLE "coach_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT,
    "specialties" TEXT[],
    "photo_path" TEXT,
    "booking_url" TEXT,
    "listed" BOOLEAN NOT NULL DEFAULT false,
    "stripe_account_id" TEXT,
    "stripe_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "stripe_onboarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "check_in_secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_classes" (
    "id" UUID NOT NULL,
    "venue_id" UUID NOT NULL,
    "coach_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "seats_taken" INTEGER NOT NULL DEFAULT 0,
    "status" "ClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_bookings" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "booked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "attended_at" TIMESTAMP(3),

    CONSTRAINT "class_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_visits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "venue_id" UUID NOT NULL,
    "class_id" UUID,
    "source" "CheckInSource" NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coach_profiles_user_id_key" ON "coach_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "coach_profiles_stripe_account_id_key" ON "coach_profiles"("stripe_account_id");

-- CreateIndex
CREATE INDEX "coach_profiles_listed_idx" ON "coach_profiles"("listed");

-- CreateIndex
CREATE INDEX "gym_classes_venue_id_starts_at_idx" ON "gym_classes"("venue_id", "starts_at");

-- CreateIndex
CREATE INDEX "gym_classes_coach_id_starts_at_idx" ON "gym_classes"("coach_id", "starts_at");

-- CreateIndex
CREATE INDEX "gym_classes_starts_at_idx" ON "gym_classes"("starts_at");

-- CreateIndex
CREATE INDEX "class_bookings_user_id_booked_at_idx" ON "class_bookings"("user_id", "booked_at");

-- CreateIndex
CREATE INDEX "class_bookings_class_id_status_idx" ON "class_bookings"("class_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "class_bookings_class_id_user_id_key" ON "class_bookings"("class_id", "user_id");

-- CreateIndex
CREATE INDEX "gym_visits_user_id_checked_in_at_idx" ON "gym_visits"("user_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "gym_visits_venue_id_checked_in_at_idx" ON "gym_visits"("venue_id", "checked_in_at");

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_classes" ADD CONSTRAINT "gym_classes_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_classes" ADD CONSTRAINT "gym_classes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "gym_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_visits" ADD CONSTRAINT "gym_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_visits" ADD CONSTRAINT "gym_visits_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_visits" ADD CONSTRAINT "gym_visits_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "gym_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

