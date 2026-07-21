/**
 * DEV ONLY — make the signed-in account a trainer with something to look at.
 *
 * Flips the account to PT, links it to itself as a client, and grants ACTIVITY
 * consent to TRAINER so the roster has a real, consent-gated row.
 *
 * Run:  pnpm --filter @pulse/api exec tsx scripts/seed-trainer-demo.ts <email>
 * Undo: pnpm --filter @pulse/api exec tsx scripts/seed-trainer-demo.ts <email> --undo
 */
import {
  PrismaClient,
  Role,
  StaffKind,
  StaffLinkStatus,
  StaffStatus,
  ConsentCategory,
  ConsentAudience,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const undo = process.argv.includes("--undo");
  if (!email) throw new Error("usage: seed-trainer-demo.ts <email> [--undo]");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user) throw new Error(`no user with email ${email}`);

  if (undo) {
    await prisma.staffLink.deleteMany({ where: { staffId: user.id, clientId: user.id } });
    await prisma.staffProfile.deleteMany({ where: { userId: user.id } });
    // role is left alone: it's the platform role now, and the demo never changes it
    console.log(`reverted ${email}: staff capability and demo link removed`);
    return;
  }

  // Capability, not role — this mirrors what admin.grantStaff does in the app.
  await prisma.staffProfile.upsert({
    where: { userId_kind: { userId: user.id, kind: StaffKind.PT } },
    create: {
      userId: user.id,
      kind: StaffKind.PT,
      status: StaffStatus.VERIFIED,
      credential: "demo seed",
      verifiedAt: new Date(),
    },
    update: { status: StaffStatus.VERIFIED, verifiedAt: new Date() },
  });

  await prisma.staffLink.upsert({
    where: { clientId_staffId_role: { clientId: user.id, staffId: user.id, role: Role.PT } },
    create: {
      clientId: user.id,
      staffId: user.id,
      role: Role.PT,
      kind: StaffKind.PT,
      status: StaffLinkStatus.ACTIVE,
    },
    update: { status: StaffLinkStatus.ACTIVE, kind: StaffKind.PT },
  });

  await prisma.consent.upsert({
    where: { userId_category: { userId: user.id, category: ConsentCategory.ACTIVITY } },
    create: { userId: user.id, category: ConsentCategory.ACTIVITY, audience: ConsentAudience.TRAINER },
    update: { audience: ConsentAudience.TRAINER },
  });

  console.log(`${email} now holds a VERIFIED PT capability, is linked to itself as a client, and shares ACTIVITY with TRAINER`);
  console.log("undo with: --undo");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
