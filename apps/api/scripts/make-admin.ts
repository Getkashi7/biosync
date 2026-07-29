/**
 * Bootstrap the FIRST platform admin.
 *
 * Every other role change goes through `admin.grantStaff`, which requires an
 * admin to already exist — so the very first one has to come from outside the
 * app. That's this script, and it should stay the only way: a self-service
 * route to ADMIN would let anyone grant themselves the ability to read other
 * people's health data.
 *
 * Deliberately not an API procedure and not reachable from the app. It needs
 * database credentials, which means someone with server access ran it on
 * purpose.
 *
 * Run:  pnpm --filter @pulse/api exec tsx scripts/make-admin.ts <email>
 * Undo: pnpm --filter @pulse/api exec tsx scripts/make-admin.ts <email> --undo
 */
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const undo = process.argv.includes("--undo");
  if (!email) throw new Error("usage: make-admin.ts <email> [--undo]");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw new Error(`no account with email ${email} — sign up in the app first`);

  if (undo) {
    if (user.role !== Role.ADMIN) {
      console.log(`${email} is ${user.role}, not ADMIN — nothing to undo`);
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.USER } });
    console.log(`${email} is no longer an admin`);
    return;
  }

  if (user.role === Role.ADMIN) {
    console.log(`${email} is already an admin`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: Role.ADMIN } });
  console.log(`${email} is now an ADMIN (was ${user.role})`);
  console.log("They can now grant staff capability from Profile → Admin, without touching the database.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
