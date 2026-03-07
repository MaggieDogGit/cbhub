import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBankingGroupSchema, insertLegalEntitySchema, insertBicSchema, insertCorrespondentServiceSchema, insertClsProfileSchema, insertFmiSchema, insertConversationSchema, insertMessageSchema } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.session?.authenticated) return next();
  res.status(401).json({ message: "Unauthorized" });
};

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Auth endpoints (not protected)
  app.get("/api/auth/me", (req, res) => {
    if (req.session?.authenticated) {
      res.json({ authenticated: true });
    } else {
      res.status(401).json({ authenticated: false });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const validUsername = process.env.AUTH_USERNAME;
    const validPassword = process.env.AUTH_PASSWORD;
    if (!validUsername || !validPassword) {
      return res.status(500).json({ message: "Auth credentials not configured. Set AUTH_USERNAME and AUTH_PASSWORD secrets." });
    }
    if (username === validUsername && password === validPassword) {
      req.session.authenticated = true;
      res.json({ ok: true });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {});
    res.json({ ok: true });
  });

  // Protect all remaining API routes
  app.use("/api", requireAuth);

  // Banking Groups
  app.get("/api/banking-groups", async (_req, res) => {
    res.json(await storage.listBankingGroups());
  });
  app.post("/api/banking-groups", async (req, res) => {
    const parsed = insertBankingGroupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createBankingGroup(parsed.data));
  });
  app.patch("/api/banking-groups/:id", async (req, res) => {
    res.json(await storage.updateBankingGroup(req.params.id, req.body));
  });
  app.delete("/api/banking-groups/:id", async (req, res) => {
    await storage.deleteBankingGroup(req.params.id);
    res.json({ ok: true });
  });

  // Legal Entities
  app.get("/api/legal-entities", async (_req, res) => {
    res.json(await storage.listLegalEntities());
  });
  app.post("/api/legal-entities", async (req, res) => {
    const parsed = insertLegalEntitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createLegalEntity(parsed.data));
  });
  app.patch("/api/legal-entities/:id", async (req, res) => {
    res.json(await storage.updateLegalEntity(req.params.id, req.body));
  });
  app.delete("/api/legal-entities/:id", async (req, res) => {
    await storage.deleteLegalEntity(req.params.id);
    res.json({ ok: true });
  });

  // BICs
  app.get("/api/bics", async (_req, res) => {
    res.json(await storage.listBics());
  });
  app.post("/api/bics", async (req, res) => {
    const parsed = insertBicSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createBic(parsed.data));
  });
  app.patch("/api/bics/:id", async (req, res) => {
    res.json(await storage.updateBic(req.params.id, req.body));
  });
  app.delete("/api/bics/:id", async (req, res) => {
    await storage.deleteBic(req.params.id);
    res.json({ ok: true });
  });

  // Correspondent Services
  app.get("/api/correspondent-services", async (req, res) => {
    const currency = req.query.currency as string | undefined;
    res.json(await storage.listCorrespondentServices(currency));
  });
  app.post("/api/correspondent-services", async (req, res) => {
    const parsed = insertCorrespondentServiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createCorrespondentService(parsed.data));
  });
  app.patch("/api/correspondent-services/:id", async (req, res) => {
    res.json(await storage.updateCorrespondentService(req.params.id, req.body));
  });
  app.delete("/api/correspondent-services/:id", async (req, res) => {
    await storage.deleteCorrespondentService(req.params.id);
    res.json({ ok: true });
  });

  // CLS Profiles
  app.get("/api/cls-profiles", async (_req, res) => {
    res.json(await storage.listClsProfiles());
  });
  app.post("/api/cls-profiles", async (req, res) => {
    const parsed = insertClsProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createClsProfile(parsed.data));
  });
  app.patch("/api/cls-profiles/:id", async (req, res) => {
    res.json(await storage.updateClsProfile(req.params.id, req.body));
  });
  app.delete("/api/cls-profiles/:id", async (req, res) => {
    await storage.deleteClsProfile(req.params.id);
    res.json({ ok: true });
  });

  // FMIs
  app.get("/api/fmis", async (_req, res) => {
    res.json(await storage.listFmis());
  });
  app.post("/api/fmis", async (req, res) => {
    const parsed = insertFmiSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createFmi(parsed.data));
  });
  app.patch("/api/fmis/:id", async (req, res) => {
    res.json(await storage.updateFmi(req.params.id, req.body));
  });
  app.delete("/api/fmis/:id", async (req, res) => {
    await storage.deleteFmi(req.params.id);
    res.json({ ok: true });
  });

  // Conversations
  app.get("/api/conversations", async (_req, res) => {
    res.json(await storage.listConversations());
  });
  app.post("/api/conversations", async (req, res) => {
    const parsed = insertConversationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createConversation(parsed.data));
  });
  app.delete("/api/conversations/:id", async (req, res) => {
    await storage.deleteConversation(req.params.id);
    res.json({ ok: true });
  });

  // Messages
  app.get("/api/conversations/:id/messages", async (req, res) => {
    res.json(await storage.listMessages(req.params.id));
  });
  app.post("/api/conversations/:id/messages", async (req, res) => {
    const { role, content } = req.body;
    if (!role || !content) return res.status(400).json({ message: "role and content required" });
    const msg = await storage.createMessage({ conversation_id: req.params.id, role, content });
    res.json(msg);
  });

  // AI Research
  app.post("/api/research", async (req, res) => {
    const { bankName } = req.body;
    if (!bankName) return res.status(400).json({ message: "bankName required" });
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a correspondent banking expert. Return only valid JSON.",
          },
          {
            role: "user",
            content: `Research the correspondent banking services offered by "${bankName}".

For each major currency they service, provide details in strict JSON format. Only include currencies you are confident about.

Return ONLY a valid JSON object like this:
{
  "bank": "${bankName}",
  "headquarters": "Country name",
  "gsib": true or false,
  "services": [
    {
      "currency": "USD",
      "service_type": "Correspondent Banking",
      "rtgs_membership": true,
      "instant_scheme_access": false,
      "cls_member": true,
      "nostro_accounts_offered": true,
      "vostro_accounts_offered": true,
      "target_clients": "Banks, Payment Institutions",
      "source": "Public knowledge"
    }
  ]
}

Service type must be one of: Correspondent Banking, Currency Clearing, RTGS Participation, Instant Payments Access, FX Liquidity, CLS Settlement, Custody Services, Transaction Banking, Liquidity Services.
Currencies must be from: EUR, USD, GBP, JPY, CHF, CAD, AUD, SGD, HKD, CNH, SEK, NOK, DKK, PLN, CZK, HUF, RON, TRY, ZAR, BRL, MXN, INR.`,
          },
        ],
      });
      const result = JSON.parse(response.choices[0].message.content || "{}");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // AI Chat
  app.post("/api/chat", async (req, res) => {
    const { conversationId, message } = req.body;
    if (!conversationId || !message) return res.status(400).json({ message: "conversationId and message required" });
    try {
      const history = await storage.listMessages(conversationId);
      const systemPrompt = `You are the CB Provider Intelligence Agent, an expert in correspondent banking. You help users research global correspondent banking providers, understand currency clearing markets, and identify coverage gaps. You have access to the user's database of banking groups, legal entities, BICs, and correspondent services. Be concise, accurate, and helpful. Always caveat AI-generated information as needing verification.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user", content: message },
        ],
      });
      const assistantContent = response.choices[0].message.content || "I couldn't generate a response.";
      const assistantMsg = await storage.createMessage({
        conversation_id: conversationId,
        role: "assistant",
        content: assistantContent,
      });
      res.json(assistantMsg);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
