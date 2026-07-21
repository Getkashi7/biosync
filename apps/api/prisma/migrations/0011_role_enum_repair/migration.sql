-- Repair: add the staff values to the Role enum.
--
-- `0001_init` created the enum as ('USER', 'ADMIN'). PT and PRACTITIONER were
-- added directly to the live database by a slice that was later rolled back, so
-- they exist there and in schema.prisma but in NO migration. `0009_staff_links`
-- then referenced "Role" for its column, which means a database rebuilt purely
-- from migrations (CI, staging, a fresh machine) would not have these values.
--
-- Hand-written on purpose: `prisma migrate diff` compares against the live
-- database, where the values already exist, so it generates nothing.
--
-- IF NOT EXISTS makes this a no-op on the live database and a repair everywhere
-- else, so it is safe to apply in any environment.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PRACTITIONER';
