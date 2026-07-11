/**
 * Prisma client singleton. Instantiation is cheap and does not connect;
 * the connection opens lazily on first query.
 */
import "./env"; // ensures .env is loaded before Prisma reads DATABASE_URL
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
