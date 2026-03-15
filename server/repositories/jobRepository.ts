import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import {
  agentJobs, conversations, chatMessages,
  type AgentJob, type InsertAgentJob,
  type Conversation, type InsertConversation,
  type ChatMessage, type InsertMessage,
} from "@shared/schema";

// ── Agent Jobs ───────────────────────────────────────────────────────────────

export async function listJobs(): Promise<AgentJob[]> {
  return db.select().from(agentJobs).orderBy(agentJobs.queued_at);
}

export async function getJob(id: string): Promise<AgentJob | undefined> {
  const [r] = await db.select().from(agentJobs).where(eq(agentJobs.id, id));
  return r;
}

export async function createJob(data: InsertAgentJob): Promise<AgentJob> {
  const [r] = await db.insert(agentJobs).values(data).returning();
  return r;
}

export async function updateJob(id: string, data: Partial<AgentJob>): Promise<AgentJob> {
  const [r] = await db.update(agentJobs).set(data as any).where(eq(agentJobs.id, id)).returning();
  return r;
}

export async function deleteJob(id: string): Promise<void> {
  await db.delete(agentJobs).where(eq(agentJobs.id, id));
}

// ── Conversations ────────────────────────────────────────────────────────────

export async function listConversations(): Promise<Conversation[]> {
  return db.select().from(conversations).orderBy(conversations.created_at);
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const [r] = await db.select().from(conversations).where(eq(conversations.id, id));
  return r;
}

export async function createConversation(data: InsertConversation): Promise<Conversation> {
  const [r] = await db.insert(conversations).values(data).returning();
  return r;
}

export async function deleteConversation(id: string): Promise<void> {
  await db.delete(chatMessages).where(eq(chatMessages.conversation_id, id));
  await db.delete(conversations).where(eq(conversations.id, id));
}

const TOPIC_LABELS: Record<string, string> = {
  "banking-groups": "Banking Groups",
  "entities-bics": "Legal Entities & BICs",
  "cb-services": "CB Services",
  "fmi": "FMI Memberships",
  "general": "General",
};

export async function getOrCreateTopicConversation(topic: string): Promise<Conversation> {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.topic, topic))
    .orderBy(desc(conversations.created_at))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(conversations)
    .values({ name: TOPIC_LABELS[topic] ?? topic, topic })
    .returning();
  return created;
}

export async function getOrCreateMainConversation(): Promise<Conversation> {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.topic, "main"))
    .orderBy(desc(conversations.created_at))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(conversations)
    .values({ name: "CB Agent Chat", topic: "main" })
    .returning();
  return created;
}

// ── Chat Messages ────────────────────────────────────────────────────────────

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversation_id, conversationId))
    .orderBy(chatMessages.created_at);
}

export async function createMessage(data: InsertMessage): Promise<ChatMessage> {
  const [r] = await db.insert(chatMessages).values(data).returning();
  return r;
}
