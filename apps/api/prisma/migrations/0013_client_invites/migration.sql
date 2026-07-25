-- CreateTable
CREATE TABLE "client_invites" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "kind" "StaffKind" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "email" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by" UUID,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_invites_staff_id_created_at_idx" ON "client_invites"("staff_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_invites_code_hash_key" ON "client_invites"("code_hash");

-- AddForeignKey
ALTER TABLE "client_invites" ADD CONSTRAINT "client_invites_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invites" ADD CONSTRAINT "client_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

