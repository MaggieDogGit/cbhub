// Absorbed from server/routes.ts: /api/conversations/*, /api/conversations/:id/messages, /api/chat

import { Router } from "express";
import { storage } from "../storage";
import { insertConversationSchema } from "@shared/schema";
import { runChat } from "../services/chatAgentService";

const router = Router();

router.get("/conversations", async (_req, res) => {
  res.json(await storage.listConversations());
});
router.post("/conversations", async (req, res) => {
  const parsed = insertConversationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  res.json(await storage.createConversation(parsed.data));
});
router.delete("/conversations/:id", async (req, res) => {
  await storage.deleteConversation(req.params.id);
  res.json({ ok: true });
});
router.get("/conversations/main", async (_req, res) => {
  res.json(await storage.getOrCreateMainConversation());
});
router.get("/conversations/topic/:topic", async (req, res) => {
  res.json(await storage.getOrCreateMainConversation());
});

router.get("/conversations/:id/messages", async (req, res) => {
  res.json(await storage.listMessages(req.params.id));
});
router.post("/conversations/:id/messages", async (req, res) => {
  const { role, content } = req.body;
  if (!role || !content) return res.status(400).json({ message: "role and content required" });
  const msg = await storage.createMessage({ conversation_id: req.params.id, role, content });
  res.json(msg);
});

router.post("/chat", async (req, res) => {
  const { conversationId, message } = req.body;
  if (!conversationId || !message) return res.status(400).json({ message: "conversationId and message required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const emit = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await runChat(conversationId, message, emit);
    res.end();
  } catch (err: any) {
    emit({ type: "error", message: err.message });
    res.end();
  }
});

export default router;
