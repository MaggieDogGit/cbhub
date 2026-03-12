import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { insertBankingGroupSchema, insertLegalEntitySchema, insertBicSchema, insertCorrespondentServiceSchema, insertClsProfileSchema, insertFmiSchema, insertFmiRegistrySchema, insertFmiResearchJobSchema, insertDataSourceSchema, insertConversationSchema, insertMessageSchema, insertAgentJobSchema, insertIntelObservationSchema } from "@shared/schema";
import OpenAI from "openai";
import { buildSystemPrompt, runAgentLoop } from "./agentCore";
import { startJobRunner, CURRENCY_COUNTRY, COUNTRY_CURRENCY } from "./jobRunner";
import { startFmiJobRunner } from "./fmiResearchJobRunner";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function isValidToken(token: string): Promise<boolean> {
  try {
    const result = await pool.query(
      "SELECT sess FROM session WHERE sid = $1 AND expire > NOW()",
      [token]
    );
    if (result.rows.length === 0) return false;
    const sess = result.rows[0].sess;
    return sess?.authenticated === true;
  } catch {
    return false;
  }
}

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (req.session?.authenticated) return next();
  const token = req.headers["x-auth-token"] as string | undefined;
  if (token && await isValidToken(token)) return next();
  res.status(401).json({ message: "Unauthorized" });
};

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Auth endpoints (not protected)
  app.get("/api/auth/me", async (req, res) => {
    if (req.session?.authenticated) {
      return res.json({ authenticated: true });
    }
    const token = req.headers["x-auth-token"] as string | undefined;
    if (token && await isValidToken(token)) {
      return res.json({ authenticated: true });
    }
    res.status(401).json({ authenticated: false });
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
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session save failed" });
        res.json({ ok: true, token: req.session.id });
      });
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
  app.post("/api/banking-groups/merge", async (req, res) => {
    const { keep_id, delete_id } = req.body;
    if (!keep_id || !delete_id) return res.status(400).json({ message: "keep_id and delete_id are required" });
    if (keep_id === delete_id) return res.status(400).json({ message: "keep_id and delete_id must be different" });
    try {
      const result = await storage.mergeBankingGroups(keep_id, delete_id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
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
  app.post("/api/legal-entities/merge", async (req, res) => {
    const { keep_id, delete_id } = req.body;
    if (!keep_id || !delete_id) return res.status(400).json({ message: "keep_id and delete_id are required" });
    if (keep_id === delete_id) return res.status(400).json({ message: "keep_id and delete_id must be different" });
    try {
      const result = await storage.mergeLegalEntities(keep_id, delete_id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
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

  // FMI Registry
  app.get("/api/fmi-registry", async (_req, res) => {
    res.json(await storage.listFmiRegistry());
  });
  app.post("/api/fmi-registry", async (req, res) => {
    const parsed = insertFmiRegistrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createFmiRegistryEntry(parsed.data));
  });
  app.patch("/api/fmi-registry/:id", async (req, res) => {
    res.json(await storage.updateFmiRegistryEntry(req.params.id, req.body));
  });
  app.delete("/api/fmi-registry/:id", async (req, res) => {
    await storage.deleteFmiRegistryEntry(req.params.id);
    res.json({ ok: true });
  });

  // FMI Research Jobs
  app.get("/api/fmi-research-jobs", async (_req, res) => {
    res.json(await storage.listFmiResearchJobs());
  });
  app.post("/api/fmi-research-jobs", async (req, res) => {
    const { fmi_name, member_list, total_members } = req.body;
    if (!fmi_name) return res.status(400).json({ message: "fmi_name required" });
    const registryEntry = await storage.getFmiRegistryByName(fmi_name);
    if (!registryEntry) return res.status(400).json({ message: `FMI "${fmi_name}" not found in registry.` });
    
    const jobData: any = { fmi_name, status: "pending" };
    if (member_list) jobData.member_list = member_list;
    if (total_members) jobData.total_members = total_members;
    const job = await storage.createFmiResearchJob(jobData);
    res.status(201).json(job);
  });
  app.post("/api/fmi-research-jobs/stop-queue", async (req, res) => {
    const jobs = await storage.listFmiResearchJobs();
    const pending = jobs.filter(j => j.status === "pending");
    for (const job of pending) {
      await storage.updateFmiResearchJob(job.id, { status: "failed", error_message: "Job cancelled by user" });
    }
    res.json({ stopped: pending.length });
  });

  // Data Sources
  app.get("/api/data-sources", async (_req, res) => {
    res.json(await storage.listDataSources());
  });
  app.post("/api/data-sources", async (req, res) => {
    const parsed = insertDataSourceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createDataSource(parsed.data));
  });
  app.patch("/api/data-sources/:id", async (req, res) => {
    res.json(await storage.updateDataSource(req.params.id, req.body));
  });
  app.delete("/api/data-sources/:id", async (req, res) => {
    await storage.deleteDataSource(req.params.id);
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
  app.get("/api/conversations/topic/:topic", async (req, res) => {
    res.json(await storage.getOrCreateTopicConversation(req.params.topic));
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
      // Step 1: search the web for current information about the bank
      const searchResponse = await openai.chat.completions.create({
        model: "gpt-4o-search-preview",
        messages: [
          {
            role: "user",
            content: `Search for current information about "${bankName}" correspondent banking services, currencies they clear, RTGS memberships, CLS membership, and their role as a correspondent bank. Include their headquarters country and whether they are a G-SIB.`,
          },
        ],
      } as any);
      const webContext = searchResponse.choices[0].message.content || "";

      // Step 2: structure the results as JSON using gpt-4o
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
            content: `Based on the following up-to-date web research, structure the correspondent banking information for "${bankName}" as JSON.

Web research:
${webContext}

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
      "source": "Web search"
    }
  ]
}

Service type must be one of: Correspondent Banking, Currency Clearing, RTGS Participation, Instant Payments Access, FX Liquidity, CLS Settlement, Custody Services, Transaction Banking, Liquidity Services.
Currencies must be from: EUR, USD, GBP, JPY, CHF, CAD, AUD, SGD, HKD, CNH, SEK, NOK, DKK, PLN, CZK, HUF, RON, TRY, ZAR, BRL, MXN, INR.
Only include currencies and services you found evidence for in the research.`,
          },
        ],
      });
      const result = JSON.parse(response.choices[0].message.content || "{}");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Agent Jobs CRUD
  app.get("/api/jobs", async (_req, res) => {
    res.json(await storage.listJobs());
  });
  app.post("/api/jobs", async (req, res) => {
    const { banking_group_id, banking_group_name, currency_scope, job_mode } = req.body;
    if (!banking_group_id || !banking_group_name) return res.status(400).json({ message: "banking_group_id and banking_group_name required" });
    const existing = await storage.listJobs();
    const active = existing.find(j => j.banking_group_id === banking_group_id && (j.status === "pending" || j.status === "running"));
    if (active) return res.status(409).json({ message: "A job for this banking group is already queued or running.", job: active });
    const mode = job_mode === "light" ? "light" : "normal";
    const scope = mode === "light" ? "home_only" : (["home_only", "major", "all"].includes(currency_scope) ? currency_scope : "home_only");
    const job = await storage.createJob({ banking_group_id, banking_group_name, status: "pending", currency_scope: scope, job_mode: mode });
    res.json(job);
  });
  app.delete("/api/jobs/:id", async (req, res) => {
    const job = await storage.getJob(req.params.id);
    if (job && job.status === "running") return res.status(409).json({ message: "Cannot delete a running job. Wait for it to complete." });
    await storage.deleteJob(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/jobs/stop-queue", async (req, res) => {
    const jobs = await storage.listJobs();
    const pending = jobs.filter(j => j.status === "pending");
    for (const job of pending) await storage.deleteJob(job.id);
    res.json({ stopped: pending.length });
  });

  app.post("/api/jobs/queue-all", async (req, res) => {
    const { group_ids, currency_scope, job_mode } = req.body as { group_ids: { id: string; name: string }[]; currency_scope?: string; job_mode?: string };
    if (!Array.isArray(group_ids)) return res.status(400).json({ message: "group_ids array required" });
    const mode = job_mode === "light" ? "light" : "normal";
    const scope = mode === "light" ? "home_only" : (["home_only", "major", "all"].includes(currency_scope || "") ? currency_scope! : "home_only");
    const existing = await storage.listJobs();
    const activeIds = new Set(existing.filter(j => j.status === "pending" || j.status === "running").map(j => j.banking_group_id));
    const queued = [];
    for (const { id, name } of group_ids) {
      if (!activeIds.has(id)) {
        const job = await storage.createJob({ banking_group_id: id, banking_group_name: name, status: "pending", currency_scope: scope, job_mode: mode });
        queued.push(job);
      }
    }
    res.json({ queued: queued.length, jobs: queued });
  });

  app.post("/api/jobs/market-scan", async (req, res) => {
    let { market_country, market_currency } = req.body as { market_country?: string; market_currency?: string };
    if (!market_country && !market_currency) {
      return res.status(400).json({ message: "Provide market_country, market_currency, or both." });
    }
    // Derive missing value using lookup maps
    if (market_country && !market_currency) {
      market_currency = COUNTRY_CURRENCY[market_country] || "EUR"; // Eurozone countries → EUR
    } else if (market_currency && !market_country) {
      if (market_currency === "EUR") {
        return res.status(400).json({ message: "EUR covers multiple countries. Please specify a market_country (e.g. Germany, France, Italy)." });
      }
      market_country = CURRENCY_COUNTRY[market_currency];
      if (!market_country) return res.status(400).json({ message: `No home country known for "${market_currency}". Please specify market_country explicitly.` });
    }
    const existing = await storage.listJobs();
    const dupe = existing.find(j =>
      j.job_type === "market_scan" &&
      j.market_country === market_country &&
      j.market_currency === market_currency &&
      (j.status === "pending" || j.status === "running")
    );
    if (dupe) return res.status(409).json({ message: "A market scan for this country/currency is already queued or running.", job: dupe });
    const job = await storage.createJob({
      status: "pending",
      currency_scope: "home_only",
      job_mode: "normal",
      job_type: "market_scan",
      market_country,
      market_currency,
    });
    res.json(job);
  });

  // Intel Observations
  app.get("/api/intel", async (req, res) => {
    try {
      const filters: { banking_group_id?: string; obs_type?: string } = {};
      if (req.query.banking_group_id) filters.banking_group_id = req.query.banking_group_id as string;
      if (req.query.obs_type) filters.obs_type = req.query.obs_type as string;
      res.json(await storage.listIntelObservations(filters));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  app.post("/api/intel", async (req, res) => {
    try {
      const username = process.env.AUTH_USERNAME ?? "user";
      const body = { ...req.body, source_type: "user" as const, source_detail: username };
      const parsed = insertIntelObservationSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const obs = await storage.createIntelObservation(parsed.data);
      res.json(obs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  app.patch("/api/intel/:id", async (req, res) => {
    try {
      const obs = await storage.updateIntelObservation(req.params.id, req.body);
      res.json(obs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  app.delete("/api/intel/:id", async (req, res) => {
    try {
      await storage.deleteIntelObservation(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // AI Chat with full database tool calling (streaming SSE)
  app.post("/api/chat", async (req, res) => {
    const { conversationId, message, topic } = req.body;
    if (!conversationId || !message) return res.status(400).json({ message: "conversationId and message required" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const emit = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const [history, storedSources] = await Promise.all([
        storage.listMessages(conversationId),
        storage.listDataSources(),
      ]);

      const systemPrompt = buildSystemPrompt(storedSources, topic ?? undefined);
      const confirmationPattern = /^(yes|y|confirmed?|correct|go ahead|proceed|store(?: and move)?|update|ok|sure|done|do it|move on|next|continue|approved?|accept)\b/i;
      const isConfirmation = confirmationPattern.test(message.trim());

      const openaiMessages: any[] = [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.content ?? "" })),
        { role: "user", content: message },
      ];

      const assistantContent = await runAgentLoop(
        openaiMessages,
        (_name, _args, text) => { emit({ type: "status", text }); },
        12,
        isConfirmation ? "required" : "auto"
      );

      const assistantMsg = await storage.createMessage({
        conversation_id: conversationId,
        role: "assistant",
        content: assistantContent,
      });
      emit({ type: "done", message: assistantMsg });
      res.end();
    } catch (err: any) {
      emit({ type: "error", message: err.message });
      res.end();
    }
  });

  // Start the background job runners
  startJobRunner();
  startFmiJobRunner();

  return httpServer;
}
