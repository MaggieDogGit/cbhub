import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { insertBankingGroupSchema, insertLegalEntitySchema, insertBicSchema, insertCorrespondentServiceSchema, insertClsProfileSchema, insertFmiSchema, insertDataSourceSchema, insertConversationSchema, insertMessageSchema } from "@shared/schema";
import OpenAI from "openai";

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

  // AI Chat with full database tool calling
  app.post("/api/chat", async (req, res) => {
    const { conversationId, message } = req.body;
    if (!conversationId || !message) return res.status(400).json({ message: "conversationId and message required" });
    try {
      const history = await storage.listMessages(conversationId);

      const systemPrompt = `You are the CB Provider Intelligence Agent, an expert in correspondent banking with full read and write access to the database and the ability to search the web for current information.

You can perform these actions using your tools:
- LIST all banking groups, legal entities, BICs, correspondent services, FMIs
- CREATE new records for any entity type
- UPDATE existing records (you must first list to find the correct ID)
- DELETE records by ID
- SEARCH the web for current information about banks, SWIFT codes, correspondent banking services, regulatory changes, etc.

When a user asks you to add, update, change, amend, remove or delete something, use the appropriate tool to do it directly. Do not just describe what to do — actually do it.

When creating related records (e.g. a new bank), follow this hierarchy: first create the BankingGroup, then a LegalEntity linked to it, then a BIC linked to the entity, then CorrespondentServices linked to the BIC.

Use web_search when the user asks about current market information, a specific bank's services, recent news, or anything that would benefit from up-to-date data.

You also manage a DATA SOURCES library. When a user asks you to find or identify a source for data (e.g. "find the source for TARGET2 members"), you should:
1. Use web_search to find the authoritative source (official publisher URL)
2. Save it using create_data_source with appropriate category, publisher, URL, and update frequency
3. Report back what was saved

Always confirm what you have done after completing an action. Be concise and accurate. Cite sources when using web search results.`;

      const tools: any[] = [
        {
          type: "function",
          function: {
            name: "list_banking_groups",
            description: "List all banking groups in the database",
            parameters: { type: "object", properties: {} },
          },
        },
        {
          type: "function",
          function: {
            name: "create_banking_group",
            description: "Create a new banking group",
            parameters: {
              type: "object",
              required: ["group_name"],
              properties: {
                group_name: { type: "string" },
                headquarters_country: { type: "string" },
                primary_currency: { type: "string" },
                gsib_status: { type: "string", enum: ["G-SIB", "D-SIB", "N/A"] },
                website: { type: "string" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_banking_group",
            description: "Update an existing banking group by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string" },
                group_name: { type: "string" },
                headquarters_country: { type: "string" },
                primary_currency: { type: "string" },
                gsib_status: { type: "string", enum: ["G-SIB", "D-SIB", "N/A"] },
                website: { type: "string" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "delete_banking_group",
            description: "Delete a banking group by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: { id: { type: "string" } },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "list_legal_entities",
            description: "List all legal entities in the database",
            parameters: { type: "object", properties: {} },
          },
        },
        {
          type: "function",
          function: {
            name: "create_legal_entity",
            description: "Create a new legal entity linked to a banking group",
            parameters: {
              type: "object",
              required: ["group_id", "legal_name"],
              properties: {
                group_id: { type: "string" },
                group_name: { type: "string" },
                legal_name: { type: "string" },
                country: { type: "string" },
                entity_type: { type: "string", enum: ["Bank", "Branch", "Subsidiary", "Representative Office", "Other"] },
                regulator: { type: "string" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_legal_entity",
            description: "Update an existing legal entity by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string" },
                legal_name: { type: "string" },
                country: { type: "string" },
                entity_type: { type: "string" },
                regulator: { type: "string" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "delete_legal_entity",
            description: "Delete a legal entity by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: { id: { type: "string" } },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "list_bics",
            description: "List all BICs in the database",
            parameters: { type: "object", properties: {} },
          },
        },
        {
          type: "function",
          function: {
            name: "create_bic",
            description: "Create a new BIC linked to a legal entity",
            parameters: {
              type: "object",
              required: ["legal_entity_id", "bic_code"],
              properties: {
                legal_entity_id: { type: "string" },
                legal_entity_name: { type: "string" },
                bic_code: { type: "string" },
                country: { type: "string" },
                city: { type: "string" },
                is_headquarters: { type: "boolean" },
                swift_member: { type: "boolean" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_bic",
            description: "Update an existing BIC by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string" },
                bic_code: { type: "string" },
                country: { type: "string" },
                city: { type: "string" },
                is_headquarters: { type: "boolean" },
                swift_member: { type: "boolean" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "delete_bic",
            description: "Delete a BIC by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: { id: { type: "string" } },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "list_correspondent_services",
            description: "List all correspondent services, optionally filtered by currency",
            parameters: {
              type: "object",
              properties: {
                currency: { type: "string", description: "Optional currency code to filter by" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "create_correspondent_service",
            description: "Create a new correspondent service linked to a BIC",
            parameters: {
              type: "object",
              required: ["bic_id", "currency", "service_type"],
              properties: {
                bic_id: { type: "string" },
                bic_code: { type: "string" },
                group_name: { type: "string" },
                legal_entity_name: { type: "string" },
                country: { type: "string" },
                currency: { type: "string" },
                service_type: { type: "string" },
                clearing_model: { type: "string", enum: ["Onshore", "Offshore"] },
                rtgs_membership: { type: "boolean" },
                instant_scheme_access: { type: "boolean" },
                nostro_accounts_offered: { type: "boolean" },
                vostro_accounts_offered: { type: "boolean" },
                cls_member: { type: "boolean" },
                target_clients: { type: "string" },
                notes: { type: "string" },
                source: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_correspondent_service",
            description: "Update an existing correspondent service by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string" },
                currency: { type: "string" },
                service_type: { type: "string" },
                clearing_model: { type: "string" },
                rtgs_membership: { type: "boolean" },
                instant_scheme_access: { type: "boolean" },
                nostro_accounts_offered: { type: "boolean" },
                vostro_accounts_offered: { type: "boolean" },
                cls_member: { type: "boolean" },
                target_clients: { type: "string" },
                notes: { type: "string" },
                source: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "delete_correspondent_service",
            description: "Delete a correspondent service by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: { id: { type: "string" } },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "list_fmis",
            description: "List all FMI memberships (e.g. CLS Settlement Members)",
            parameters: { type: "object", properties: {} },
          },
        },
        {
          type: "function",
          function: {
            name: "create_fmi",
            description: "Create a new FMI membership record",
            parameters: {
              type: "object",
              required: ["legal_entity_id", "fmi_type"],
              properties: {
                legal_entity_id: { type: "string" },
                legal_entity_name: { type: "string" },
                fmi_type: { type: "string", enum: ["CLS_Settlement_Member"] },
                member_since: { type: "string" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "delete_fmi",
            description: "Delete an FMI membership record by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: { id: { type: "string" } },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web for current information about banks, correspondent banking services, SWIFT codes, regulatory news, or any real-time financial data",
            parameters: {
              type: "object",
              required: ["query"],
              properties: {
                query: { type: "string", description: "The search query" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "list_data_sources",
            description: "List all stored data sources (reference URLs, member lists, directories, etc.)",
            parameters: { type: "object", properties: {} },
          },
        },
        {
          type: "function",
          function: {
            name: "create_data_source",
            description: "Store a new data source reference (e.g. ECB TARGET2 member list URL, SWIFT BIC directory)",
            parameters: {
              type: "object",
              required: ["name", "category"],
              properties: {
                name: { type: "string", description: "Display name, e.g. 'ECB TARGET2 Participants'" },
                category: { type: "string", description: "Type of data, e.g. 'RTGS Members', 'CLS Members', 'SWIFT Directory', 'Regulatory', 'Market Data'" },
                url: { type: "string", description: "URL of the source" },
                publisher: { type: "string", description: "Who publishes it, e.g. 'ECB', 'CLS Group', 'SWIFT'" },
                description: { type: "string", description: "What this source contains" },
                update_frequency: { type: "string", description: "How often it is updated, e.g. 'Daily', 'Monthly', 'Quarterly'" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_data_source",
            description: "Update an existing data source record by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                category: { type: "string" },
                url: { type: "string" },
                publisher: { type: "string" },
                description: { type: "string" },
                update_frequency: { type: "string" },
                notes: { type: "string" },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "delete_data_source",
            description: "Delete a data source record by ID",
            parameters: {
              type: "object",
              required: ["id"],
              properties: { id: { type: "string" } },
            },
          },
        },
      ];

      const executeTool = async (name: string, args: any): Promise<string> => {
        try {
          switch (name) {
            case "list_banking_groups": return JSON.stringify(await storage.listBankingGroups());
            case "create_banking_group": return JSON.stringify(await storage.createBankingGroup(args));
            case "update_banking_group": { const { id, ...data } = args; return JSON.stringify(await storage.updateBankingGroup(id, data)); }
            case "delete_banking_group": await storage.deleteBankingGroup(args.id); return JSON.stringify({ ok: true, id: args.id });
            case "list_legal_entities": return JSON.stringify(await storage.listLegalEntities());
            case "create_legal_entity": return JSON.stringify(await storage.createLegalEntity(args));
            case "update_legal_entity": { const { id, ...data } = args; return JSON.stringify(await storage.updateLegalEntity(id, data)); }
            case "delete_legal_entity": await storage.deleteLegalEntity(args.id); return JSON.stringify({ ok: true, id: args.id });
            case "list_bics": return JSON.stringify(await storage.listBics());
            case "create_bic": return JSON.stringify(await storage.createBic(args));
            case "update_bic": { const { id, ...data } = args; return JSON.stringify(await storage.updateBic(id, data)); }
            case "delete_bic": await storage.deleteBic(args.id); return JSON.stringify({ ok: true, id: args.id });
            case "list_correspondent_services": return JSON.stringify(await storage.listCorrespondentServices(args.currency));
            case "create_correspondent_service": return JSON.stringify(await storage.createCorrespondentService(args));
            case "update_correspondent_service": { const { id, ...data } = args; return JSON.stringify(await storage.updateCorrespondentService(id, data)); }
            case "delete_correspondent_service": await storage.deleteCorrespondentService(args.id); return JSON.stringify({ ok: true, id: args.id });
            case "list_fmis": return JSON.stringify(await storage.listFmis());
            case "create_fmi": return JSON.stringify(await storage.createFmi(args));
            case "delete_fmi": await storage.deleteFmi(args.id); return JSON.stringify({ ok: true, id: args.id });
            case "web_search": {
              const searchResponse = await openai.chat.completions.create({
                model: "gpt-4o-search-preview",
                messages: [{ role: "user", content: args.query }],
              } as any);
              return searchResponse.choices[0].message.content || "No search results found.";
            }
            case "list_data_sources": return JSON.stringify(await storage.listDataSources());
            case "create_data_source": return JSON.stringify(await storage.createDataSource(args));
            case "update_data_source": { const { id, ...data } = args; return JSON.stringify(await storage.updateDataSource(id, data)); }
            case "delete_data_source": await storage.deleteDataSource(args.id); return JSON.stringify({ ok: true, id: args.id });
            default: return JSON.stringify({ error: `Unknown tool: ${name}` });
          }
        } catch (err: any) {
          return JSON.stringify({ error: err.message });
        }
      };

      const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ];

      // Agentic loop — keep calling until no more tool calls
      let assistantContent = "";
      for (let i = 0; i < 10; i++) {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages,
          tools,
          tool_choice: "auto",
        });

        const choice = response.choices[0];
        messages.push(choice.message);

        if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
          for (const toolCall of choice.message.tool_calls) {
            const args = JSON.parse(toolCall.function.arguments || "{}");
            const result = await executeTool(toolCall.function.name, args);
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        } else {
          assistantContent = choice.message.content || "Done.";
          break;
        }
      }

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
