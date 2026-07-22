/**
 * DEV ONLY — give the demo account something to look at as a client: a shared
 * training plan and a shared session note, plus one UNSHARED note to prove the
 * client only ever sees what the trainer chose to share.
 *
 * Assumes the account already holds the demo staff link (run seed-trainer-demo
 * first). Writes with trainer = client = the same account, which is fine for a
 * self-contained demo.
 *
 * Run:  pnpm --filter @pulse/api exec tsx scripts/seed-demo-content.ts <email>
 * Undo: pnpm --filter @pulse/api exec tsx scripts/seed-demo-content.ts <email> --undo
 */
import { PrismaClient } from "@prisma/client";
import { isoWeek } from "@pulse/shared";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const undo = process.argv.includes("--undo");
  if (!email) throw new Error("usage: seed-demo-content.ts <email> [--undo]");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`no user with email ${email}`);
  const id = user.id;

  if (undo) {
    await prisma.trainingPlan.deleteMany({ where: { trainerId: id, clientId: id } });
    await prisma.sessionNote.deleteMany({ where: { trainerId: id, clientId: id } });
    console.log(`removed demo plans + notes for ${email}`);
    return;
  }

  const week = isoWeek();

  await prisma.trainingPlan.upsert({
    where: { trainerId_clientId_week: { trainerId: id, clientId: id, week } },
    create: {
      trainerId: id,
      clientId: id,
      week,
      title: "Base strength",
      items: [
        { name: "Back squat", sets: 4, reps: 6 },
        { name: "Romanian deadlift", sets: 3, reps: 10 },
        { name: "Walking lunge", sets: 3, reps: 12 },
      ],
    },
    update: {},
  });

  await prisma.sessionNote.create({
    data: {
      trainerId: id,
      clientId: id,
      body: "Great work this week — your squat depth is looking much better. Keep the two easy runs before we meet again, and get lights-out by 22:30 on training days.",
      sharedWithClient: true,
    },
  });

  await prisma.sessionNote.create({
    data: {
      trainerId: id,
      clientId: id,
      body: "(private) Client mentioned left knee twinge — watch lunge depth next session, don't flag unless it recurs.",
      sharedWithClient: false,
    },
  });

  console.log(`seeded ${email}: 1 plan (${week}), 1 shared note, 1 private note`);
  console.log("the client view should show the plan + the shared note only");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
