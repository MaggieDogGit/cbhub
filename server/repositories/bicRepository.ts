import { eq } from "drizzle-orm";
import { db } from "../db";
import { bics, type Bic, type InsertBic } from "@shared/schema";

export async function listBics(): Promise<Bic[]> {
  return db.select().from(bics);
}

export async function getBic(id: string): Promise<Bic | undefined> {
  const [r] = await db.select().from(bics).where(eq(bics.id, id));
  return r;
}

export async function createBic(data: InsertBic): Promise<Bic> {
  const [r] = await db.insert(bics).values(data).returning();
  return r;
}

export async function updateBic(id: string, data: Partial<InsertBic>): Promise<Bic> {
  const [r] = await db.update(bics).set(data).where(eq(bics.id, id)).returning();
  return r;
}

export async function deleteBic(id: string): Promise<void> {
  await db.delete(bics).where(eq(bics.id, id));
}
