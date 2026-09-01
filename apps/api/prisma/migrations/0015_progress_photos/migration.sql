-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "taken_on" DATE NOT NULL,
    "audience_override" "ConsentAudience",
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photos_user_id_taken_on_idx" ON "photos"("user_id", "taken_on");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

