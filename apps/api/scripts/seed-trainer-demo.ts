/**
 * DEV ONLY — make the signed-in account a trainer with something to look at.
 *
 * Flips the account to PT, links it to itself as a client, and grants ACTIVITY
 * consent to TRAINER so the roster has a real, consent-gated row.
 *
 * Run:  pnpm --filter @pulse/api exec tsx scripts/seed-trainer-demo.ts <email>
 * Undo: pnpm --filter @pulse/api exec tsx scripts/seed-trainer-demo.ts <email> --undo
 */
import { PrismaClient, Role, StaffLinkStatus, ConsentCategory, ConsentAudience } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const undo = process.argv.includes("--undo");
  if (!email) throw new Error("usage: seed-trainer-demo.ts <email> [--undo]");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user) throw new Error(`no user with email ${email}`);

  if (undo) {
    await prisma.staffLink.deleteMany({ where: { staffId: user.id, clientId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.USER } });
    console.log(`reverted ${email} → USER, demo link removed`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: Role.PT } });

  await prisma.staffLink.upsert({
    where: { clientId_staffId_role: { clientId: user.id, staffId: user.id, role: Role.PT } },
    create: { clientId: user.id, staffId: user.id, role: Role.PT, status: StaffLinkStatus.ACTIVE },
    update: { status: StaffLinkStatus.ACTIVE },
  });

  await prisma.consent.upsert({
    where: { userId_category: { userId: user.id, category: ConsentCategory.ACTIVITY } },
    create: { userId: user.id, category: ConsentCategory.ACTIVITY, audience: ConsentAudience.TRAINER },
    update: { audience: ConsentAudience.TRAINER },
  });

  console.log(`${email} is now PT, linked to itself as a client, ACTIVITY shared with TRAINER`);
  console.log("undo with: --undo");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
