import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ChevronDown, ChevronRight, Search, ShieldCheck, Globe, Radio, TrendingUp,
  Bot, Zap, ExternalLink, CheckCircle2, XCircle, Clock, Loader2, RefreshCw, X,
  CheckSquare, Square, PlusCircle, Trash2, User, BotIcon, Swords, Building2, Cpu,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BankingGroup, LegalEntity, Bic, CorrespondentService, Fmi, AgentJob, IntelObservation } from "@shared/schema";

type CurrencyScope = "home_only" | "major" | "all";
type JobMode = "light" | "normal";

const SCOPE_OPTIONS: { value: CurrencyScope; label: string }[] = [
  { value: "home_only", label: "Home" },
  { value: "major",    label: "EUR/GBP/USD" },
  { value: "all",      label: "All" },
];

const SCOPE_LABELS: Record<CurrencyScope, string> = {
  home_only: "Home",
  major:     "EUR/GBP/USD",
  all:       "All CCY",
};

const CURRENCIES = ["all","EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","NZD","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR","KRW","ILS"];
const SERVICE_TYPES = ["all","Correspondent Banking","Global Currency Clearing","Currency Clearing","RTGS Participation","Instant Payments Access","FX Liquidity","CLS Settlement","Custody Services","Transaction Banking","Liquidity Services"];

const CLS_CURRENCIES = new Set(["AUD","CAD","CHF","DKK","EUR","GBP","HKD","JPY","MXN","NOK","NZD","SEK","SGD","USD","ILS","ZAR","KRW","HUF"]);

function buildAgentPrompt(group: BankingGroup, entityCount: number, bicCount: number, serviceCount: number): string {
  const rtgsLabel = group.rtgs_system || (group.primary_currency ? `identify RTGS for ${group.primary_currency}` : "not identified");
  const clsLine = group.primary_currency && CLS_CURRENCIES.has(group.primary_currency)
    ? `CLS (fmi_type "FX Settlement Systems") — ${group.primary_currency} is CLS-eligible. First call check_fmi_membership for the HQ entity + "CLS". If not already recorded, run ONE search "${group.group_name} CLS settlement member" to confirm, then create if confirmed.`
    : `CLS — verify whether ${group.primary_currency || "the home currency"} participates in CLS`;
  return `Run the CB Entity Setup workflow for ${group.group_name}${group.headquarters_country ? ` (${group.headquarters_country})` : ""} [Scope: all currencies]
Group ID: ${group.id} | Home currency: ${group.primary_currency || "not set"} | RTGS: ${rtgsLabel} | CB probability: ${group.cb_probability || "not set"}
Current DB state: ${entityCount} legal entit${entityCount !== 1 ? "ies" : "y"}, ${bicCount} BIC${bicCount !== 1 ? "s" : ""}, ${serviceCount} service${serviceCount !== 1 ? "s" : ""} recorded.

---
STEP 1 — VERIFY BANKING GROUP RECORD
Locate this group using list_banking_groups (ID: ${group.id}).
If any of the following fields are missing, research and fill them now using update_banking_group before proceeding:
• primary_currency  • rtgs_system  • rtgs_member (boolean)  • cb_probability (High/Medium/Low/Unconfirmed)  • cb_evidence (one-sentence summary)

---
STEP 2 — IDENTIFY CORRESPONDENT BANKING LEGAL ENTITIES
Search: "${group.group_name} correspondent banking SWIFT BIC legal entity".
Include: (a) the primary HQ licensed banking entity, (b) dedicated CB-hub or transaction-banking subsidiaries, and (c) regional or national banking subsidiaries that hold a local banking licence and are direct participants in a local RTGS or payment clearing system — even if they are primarily retail/commercial banks. Local RTGS/clearing participation is sufficient qualification.
For globally active or G-SIB banks, additionally check for documented CB operations in the following major clearing centres: Singapore (SGD/MEPS+), Hong Kong (HKD/CHATS), Japan (JPY/BOJ-NET), Australia (AUD/RITS). If the bank has a licensed branch or subsidiary with confirmed RTGS direct participation in any of these markets, include it.
Exclude: holding companies, insurance or asset-management arms, dormant entities, and any subsidiary that does not hold a direct banking licence or payment system membership.
Ownership check: verify each candidate is currently owned/operated by ${group.group_name} — do not add subsidiaries that have been divested or are under a different parent.
For each candidate: call find_legal_entity_by_name to check if it already exists.
• Exists → note its ID; update missing fields using update_legal_entity.
• Does not exist → create with create_legal_entity linked to group_id ${group.id}.

---
STEP 3 — BIC CODES
For every entity: call list_bics to check if a BIC is already linked.
• BIC exists → use its ID; update missing fields using update_bic.
• Missing → add with create_bic. Set is_headquarters=true and swift_member=true for the primary HQ entity's BIC.

---
STEP 4 — CORRESPONDENT SERVICES
For each BIC, identify all currencies that entity offers CB services in.
Before creating: call list_correspondent_services to confirm no duplicate exists.
• Exists → update missing details; do NOT create a duplicate.
• Missing → create with create_correspondent_service (bic_id from list_bics).
Onshore vs Offshore — base this on the ENTITY'S country, not the group's home country:
• Onshore → entity's country is the home settlement country for that currency → service_type = "Correspondent Banking"
• Offshore → any other combination → service_type = "Global Currency Clearing"
TRAP 1 — PARENT CURRENCY: Do NOT mark Onshore just because the currency matches the banking group's primary_currency. A foreign subsidiary offering its parent's home currency is still Offshore (e.g. a US bank's German entity offering USD → Offshore).
TRAP 2 — EUROZONE SUBSIDIARIES: A subsidiary in any Eurozone country (AT, DE, FR, IT, ES, NL, BE, PT, IE, FI, SK, SI, EE, LV, LT, MT, CY, GR, LU, and HR since Jan 2023) offering EUR is Onshore → "Correspondent Banking" + TARGET2. Do not mark it Offshore because its parent is in a different Eurozone country.

---
STEP 5 — FMI MEMBERSHIPS
For EVERY entity (not just the HQ), always check locally stored FMI data before searching externally.
Order of precedence: (1) call check_fmi_membership — if the record exists, skip creation; (2) if missing, create from the reference table or known rules below; (3) only run a web search if the reference table has no answer.

A) SWIFT (fmi_type "Messaging Networks") — All licensed banking entities are SWIFT members. For each entity: call check_fmi_membership(entity, "SWIFT"). If not recorded, create with create_fmi. No web search required.

B) Local RTGS (fmi_type "Payment Systems") — Follow this 3-step procedure for each entity:
   Step 1: Determine the RTGS system from the reference table below using the entity's country, then call check_fmi_membership for the entity + RTGS system name. If the record already exists, skip — do nothing more for this entity.
   Step 2: If not recorded, create with create_fmi. Do NOT search the web.
   Step 3: If the entity's country is NOT in the reference table, run ONE search "[entity name] RTGS direct participant" to identify the system, then call check_fmi_membership before creating.
   Reference table:
   Eurozone countries (AT, DE, FR, IT, ES, NL, BE, PT, IE, FI, SK, SI, EE, LV, LT, MT, CY, GR, LU, HR since Jan 2023): TARGET2
   Czech Republic: CERTIS | Hungary: VIBER | Poland: SORBNET2 | Romania: ReGIS | Sweden: RIX | Denmark: Kronos2 | Norway: NICS | Switzerland: SIC
   United Kingdom: CHAPS | United States: Fedwire | Canada: Lynx | Australia: RITS | Japan: BOJ-NET | Singapore: MEPS+ | Hong Kong: CHATS
   China: CNAPS | India: RTGS (RBI) | South Africa: SAMOS | Brazil: STR | South Korea: BOK-Wire+ | Israel: ZAHAV | Turkey: EFT | UAE: UAEFTS
   TRAP — COUNTRY MATCHING: Each payment system must only be assigned to an entity whose country matches the system's home jurisdiction. Never assign a foreign system to the HQ by default. Examples: CHAPS → UK entities only; Fedwire → US entities only; TARGET2 → Eurozone entities only; MEPS+ → Singapore entities only; CHATS → Hong Kong entities only; BOJ-NET → Japan entities only.

C) CLS (HQ entity only, fmi_type "FX Settlement Systems") — ${clsLine}

---
Work all 5 steps fully. End with a summary.`;
}

function JobStatusBadge({ job }: { job: AgentJob }) {
  const scope = (job.currency_scope || "home_only") as CurrencyScope;
  const scopeLabel = SCOPE_LABELS[scope];
  const isLight = job.job_mode === "light";
  const modeLabel = isLight ? "Light (gpt-4o-mini)" : "Normal (gpt-4o)";
  const tooltip = `${modeLabel} · ${scopeLabel}`;

  if (job.status === "pending") return (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs gap-1 shrink-0" title={tooltip}>
      {isLight ? <Zap className="w-3 h-3 text-amber-500" /> : <Clock className="w-3 h-3" />} Queued
    </Badge>
  );
  if (job.status === "running") return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs gap-1 shrink-0" title={tooltip}>
      <Loader2 className="w-3 h-3 animate-spin" /> Running {job.steps_completed ? `(${job.steps_completed})` : ""}
    </Badge>
  );
  if (job.status === "completed") return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1 shrink-0" title={tooltip}>
      <CheckCircle2 className="w-3 h-3" /> Done ({job.steps_completed})
    </Badge>
  );
  if (job.status === "failed") return (
    <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1 shrink-0" title={`${tooltip}${job.error_message ? ` · ${job.error_message}` : ""}`}>
      <XCircle className="w-3 h-3" /> Failed
    </Badge>
  );
  return null;
}

const CB_CURRENCIES = ["EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","NZD","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR","KRW","ILS"];

type MergeDialog =
  | { type: "group"; keepId: string; keepName: string; deleteId: string; deleteName: string }
  | { type: "entity"; keepId: string; keepName: string; deleteId: string; deleteName: string }
  | null;

type IntelDialog =
  | { type: "group"; groupId: string; groupName: string; entityId?: undefined; entityName?: undefined }
  | { type: "entity"; groupId: string; groupName: string; entityId: string; entityName: string }
  | null;

export default function Providers() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [filterServiceType, setFilterServiceType] = useState("all");
  const [filterGsib, setFilterGsib] = useState("all");
  const [filterIntel, setFilterIntel] = useState<"all" | "competitor" | "cb_provider">("all");
  const [sortBy, setSortBy] = useState("name");

  // Job mode / scope
  const [jobMode, setJobMode] = useState<JobMode>("normal");
  const [currencyScope, setCurrencyScope] = useState<CurrencyScope>("home_only");

  // Expand state
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedEntities, setExpandedEntities] = useState<Record<string, boolean>>({});

  // Multi-select
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());

  // Merge dialog
  const [mergeDialog, setMergeDialog] = useState<MergeDialog>(null);

  // Market Scan
  const [scanCountry, setScanCountry] = useState("");
  const [scanCurrency, setScanCurrency] = useState("");
  const [showScanPanel, setShowScanPanel] = useState(false);
  const [scanDryRun, setScanDryRun] = useState(false);

  const SCAN_COUNTRY_CCY: Record<string, string> = {
    "Australia":"AUD","Austria":"EUR","Belgium":"EUR","Brazil":"BRL","Canada":"CAD",
    "China":"CNH","Croatia":"EUR","Czech Republic":"CZK","Denmark":"DKK","Estonia":"EUR",
    "Finland":"EUR","France":"EUR","Germany":"EUR","Greece":"EUR","Hong Kong":"HKD",
    "Hungary":"HUF","India":"INR","Ireland":"EUR","Israel":"ILS","Italy":"EUR",
    "Japan":"JPY","Latvia":"EUR","Lithuania":"EUR","Luxembourg":"EUR","Malta":"EUR",
    "Mexico":"MXN","Netherlands":"EUR","New Zealand":"NZD","Norway":"NOK","Poland":"PLN",
    "Portugal":"EUR","Romania":"RON","Singapore":"SGD","Slovakia":"EUR","Slovenia":"EUR",
    "South Africa":"ZAR","South Korea":"KRW","Spain":"EUR","Sweden":"SEK",
    "Switzerland":"CHF","Turkey":"TRY","UAE":"USD","United Kingdom":"GBP","United States":"USD",
  };

  const handleScanCountryChange = (country: string) => {
    setScanCountry(country);
    const suggested = SCAN_COUNTRY_CCY[country];
    if (suggested && !scanCurrency) setScanCurrency(suggested);
  };

  // Intel dialog
  const [intelDialog, setIntelDialog] = useState<IntelDialog>(null);
  const [intelIsCompetitor, setIntelIsCompetitor] = useState(true);
  const [intelIsCbProvider, setIntelIsCbProvider] = useState(false);
  const [intelCurrency, setIntelCurrency] = useState("");
  const [intelNotes, setIntelNotes] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("search");
    if (s) setSearch(s);
  }, []);

  // Data queries
  const { data: groups = [], isLoading: lg } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: entities = [], isLoading: le } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: bics = [], isLoading: lb } = useQuery<Bic[]>({ queryKey: ["/api/bics"] });
  const { data: services = [], isLoading: ls } = useQuery<CorrespondentService[]>({ queryKey: ["/api/correspondent-services"] });
  const { data: fmis = [], isLoading: lf } = useQuery<Fmi[]>({ queryKey: ["/api/fmis"] });
  const { data: intel = [] } = useQuery<IntelObservation[]>({ queryKey: ["/api/intel"] });
  const { data: jobs = [] } = useQuery<AgentJob[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: (query) => {
      const data = query.state.data as AgentJob[] | undefined;
      const hasActive = data?.some(j => j.status === "pending" || j.status === "running");
      return hasActive ? 5000 : 30000;
    },
  });

  const loading = lg || le || lb || ls || lf;

  // Helpers
  const toggleGroup = (id: string) => setExpandedGroups(p => ({ ...p, [id]: !p[id] }));
  const toggleEntity = (id: string) => setExpandedEntities(p => ({ ...p, [id]: !p[id] }));

  const toggleGroupSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleEntitySelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEntities(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedGroups(new Set());
    setSelectedEntities(new Set());
  };

  const getEntitiesForGroup = (groupId: string) => entities.filter(e => e.group_id === groupId);
  const getBicsForEntity = (entityId: string) => bics.filter(b => b.legal_entity_id === entityId);
  const getServicesForBic = (bicId: string) => {
    let svcs = services.filter(s => s.bic_id === bicId);
    if (filterCurrency !== "all") svcs = svcs.filter(s => s.currency === filterCurrency);
    if (filterServiceType !== "all") svcs = svcs.filter(s => s.service_type === filterServiceType);
    return svcs;
  };
  const isEntityClsMember = (entityId: string) => fmis.some(f => f.legal_entity_id === entityId && (f.fmi_name === "CLS" || f.fmi_type === "FX Settlement Systems"));
  const groupHasClsMember = (groupId: string) => getEntitiesForGroup(groupId).some(e => isEntityClsMember(e.id));

  const jobByGroup = (groupId: string): AgentJob | undefined => {
    const groupJobs = jobs.filter(j => j.banking_group_id === groupId);
    return groupJobs.sort((a, b) => new Date(b.queued_at!).getTime() - new Date(a.queued_at!).getTime())[0];
  };

  // Mutations
  const queueMutation = useMutation({
    mutationFn: (vars: { groupId: string; groupName: string; scope: CurrencyScope; mode: JobMode }) =>
      apiRequest("POST", "/api/jobs", {
        banking_group_id: vars.groupId,
        banking_group_name: vars.groupName,
        currency_scope: vars.scope,
        job_mode: vars.mode,
      }).then(r => r.json()),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Job queued", description: vars.mode === "light" ? `Light setup for ${vars.groupName}` : `Normal setup for ${vars.groupName}` });
    },
    onError: (err: any) => toast({ title: "Could not queue job", description: err.message, variant: "destructive" }),
  });

  const queueAllMutation = useMutation({
    mutationFn: (vars: { groupIds: { id: string; name: string }[]; scope: CurrencyScope; mode: JobMode }) =>
      apiRequest("POST", "/api/jobs/queue-all", { group_ids: vars.groupIds, currency_scope: vars.scope, job_mode: vars.mode }).then(r => r.json()),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: `${data.queued} jobs queued`, description: `${vars.mode === "light" ? "Light" : "Normal"} mode` });
      clearSelection();
    },
    onError: (err: any) => toast({ title: "Queue all failed", description: err.message, variant: "destructive" }),
  });

  const marketScanMutation = useMutation({
    mutationFn: (vars: { market_country?: string; market_currency?: string; dry_run?: boolean }) =>
      apiRequest("POST", "/api/jobs/market-scan", vars).then(r => r.json()),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: vars.dry_run ? "Dry-run scan queued" : "Market scan queued", description: `${vars.market_country} / ${vars.market_currency}` });
    },
    onError: (err: any) => toast({ title: "Could not queue scan", description: err.message, variant: "destructive" }),
  });

  const mergeGroupsMutation = useMutation({
    mutationFn: (vars: { keep_id: string; delete_id: string }) =>
      apiRequest("POST", "/api/banking-groups/merge", vars).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/banking-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/legal-entities"] });
      toast({ title: "Groups merged", description: `Moved ${data.moved_entities} entities. Deleted group removed.` });
      setMergeDialog(null);
      clearSelection();
    },
    onError: (err: any) => toast({ title: "Merge failed", description: err.message, variant: "destructive" }),
  });

  const mergeEntitiesMutation = useMutation({
    mutationFn: (vars: { keep_id: string; delete_id: string }) =>
      apiRequest("POST", "/api/legal-entities/merge", vars).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/legal-entities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fmis"] });
      toast({ title: "Entities merged", description: `Moved ${data.moved_bics} BICs, ${data.moved_fmis} FMI records. Deleted entity removed.` });
      setMergeDialog(null);
      clearSelection();
    },
    onError: (err: any) => toast({ title: "Merge failed", description: err.message, variant: "destructive" }),
  });

  // Filtering + sorting
  const groupMatchesFilters = (group: BankingGroup) => {
    if (filterGsib !== "all" && group.gsib_status !== filterGsib) return false;
    if (filterIntel !== "all") {
      const groupIntelObs = intel.filter(o => o.banking_group_id === group.id);
      if (!groupIntelObs.some(o => o.obs_type === filterIntel)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const groupMatch = group.group_name?.toLowerCase().includes(q) || group.headquarters_country?.toLowerCase().includes(q);
      const entityMatch = getEntitiesForGroup(group.id).some(e => e.legal_name?.toLowerCase().includes(q) || e.country?.toLowerCase().includes(q));
      const bicMatch = getEntitiesForGroup(group.id).some(e => getBicsForEntity(e.id).some(b => b.bic_code?.toLowerCase().includes(q) || b.city?.toLowerCase().includes(q)));
      if (!groupMatch && !entityMatch && !bicMatch) return false;
    }
    if (filterCurrency !== "all" || filterServiceType !== "all") {
      const allBics = getEntitiesForGroup(group.id).flatMap(e => getBicsForEntity(e.id));
      if (!allBics.some(b => getServicesForBic(b.id).length > 0)) return false;
    }
    return true;
  };

  const filteredGroups = groups.filter(groupMatchesFilters);
  const sortedGroups = [...filteredGroups].sort((a, b) => {
    if (sortBy === "name") return (a.group_name || "").localeCompare(b.group_name || "");
    if (sortBy === "country") return (a.headquarters_country || "").localeCompare(b.headquarters_country || "");
    if (sortBy === "services") {
      const aC = getEntitiesForGroup(a.id).flatMap(e => getBicsForEntity(e.id)).flatMap(b => getServicesForBic(b.id)).length;
      const bC = getEntitiesForGroup(b.id).flatMap(e => getBicsForEntity(e.id)).flatMap(b => getServicesForBic(b.id)).length;
      return bC - aC;
    }
    return 0;
  });

  // Intel helpers
  const getGroupIntel = (groupId: string) => intel.filter(o => o.banking_group_id === groupId && !o.legal_entity_id);
  const getEntityIntel = (entityId: string) => intel.filter(o => o.legal_entity_id === entityId);

  type IntelPayload = { banking_group_id: string; banking_group_name: string; legal_entity_id?: string; legal_entity_name?: string; obs_type: "competitor" | "cb_provider"; currency?: string; notes?: string };

  const addIntelMutation = useMutation({
    mutationFn: (items: IntelPayload[]) =>
      Promise.all(items.map(vars => apiRequest("POST", "/api/intel", vars).then(r => r.json()))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel"] });
      setIntelDialog(null);
      setIntelIsCompetitor(true);
      setIntelIsCbProvider(false);
      setIntelCurrency("");
      setIntelNotes("");
      toast({ title: "Intel saved" });
    },
    onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const deleteIntelMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/intel/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel"] });
      toast({ title: "Intel deleted" });
    },
    onError: (err: any) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

  const openGroupIntelDialog = (group: BankingGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    setIntelIsCompetitor(true);
    setIntelIsCbProvider(false);
    setIntelCurrency("");
    setIntelNotes("");
    setIntelDialog({ type: "group", groupId: group.id, groupName: group.group_name });
  };

  const openEntityIntelDialog = (group: BankingGroup, entity: LegalEntity, e: React.MouseEvent) => {
    e.stopPropagation();
    setIntelIsCompetitor(false);
    setIntelIsCbProvider(true);
    setIntelCurrency("");
    setIntelNotes("");
    setIntelDialog({ type: "entity", groupId: group.id, groupName: group.group_name, entityId: entity.id, entityName: entity.legal_name });
  };

  const submitIntel = () => {
    if (!intelDialog) return;
    if (!intelIsCompetitor && !intelIsCbProvider) {
      toast({ title: "Select a type", description: "Choose Competitor, CB Provider, or both.", variant: "destructive" });
      return;
    }
    if (intelIsCbProvider && !intelCurrency) {
      toast({ title: "Currency required", description: "Please select a currency for CB Provider.", variant: "destructive" });
      return;
    }
    const base = {
      banking_group_id: intelDialog.groupId,
      banking_group_name: intelDialog.groupName,
      legal_entity_id: intelDialog.entityId,
      legal_entity_name: intelDialog.entityName,
      notes: intelNotes || undefined,
    };
    const items: IntelPayload[] = [];
    if (intelIsCompetitor) items.push({ ...base, obs_type: "competitor" });
    if (intelIsCbProvider) items.push({ ...base, obs_type: "cb_provider", currency: intelCurrency });
    addIntelMutation.mutate(items);
  };

  // Merge dialog helpers
  const openGroupMergeDialog = () => {
    const ids = [...selectedGroups];
    if (ids.length !== 2) return;
    const [a, b] = ids.map(id => groups.find(g => g.id === id)!);
    setMergeDialog({ type: "group", keepId: a.id, keepName: a.group_name, deleteId: b.id, deleteName: b.group_name });
  };

  const openEntityMergeDialog = () => {
    const ids = [...selectedEntities];
    if (ids.length !== 2) return;
    const [a, b] = ids.map(id => entities.find(e => e.id === id)!);
    setMergeDialog({ type: "entity", keepId: a.id, keepName: a.legal_name, deleteId: b.id, deleteName: b.legal_name });
  };

  const swapMergeDialog = () => {
    if (!mergeDialog) return;
    setMergeDialog({ ...mergeDialog, keepId: mergeDialog.deleteId, keepName: mergeDialog.deleteName, deleteId: mergeDialog.keepId, deleteName: mergeDialog.keepName });
  };

  const confirmMerge = () => {
    if (!mergeDialog) return;
    if (mergeDialog.type === "group") {
      mergeGroupsMutation.mutate({ keep_id: mergeDialog.keepId, delete_id: mergeDialog.deleteId });
    } else {
      mergeEntitiesMutation.mutate({ keep_id: mergeDialog.keepId, delete_id: mergeDialog.deleteId });
    }
  };

  const hasSelection = selectedGroups.size > 0 || selectedEntities.size > 0;
  const selectedGroupObjects = [...selectedGroups].map(id => groups.find(g => g.id === id)).filter(Boolean) as BankingGroup[];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Banking Groups</h1>
        <p className="text-slate-500 text-sm mt-1">Browse banking groups, entities, BICs and correspondent services</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            data-testid="input-search-providers"
            placeholder="Search bank, BIC, country..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterCurrency} onValueChange={setFilterCurrency}>
          <SelectTrigger className="w-32" data-testid="select-filter-currency"><SelectValue placeholder="Currency" /></SelectTrigger>
          <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c === "all" ? "All Currencies" : c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterServiceType} onValueChange={setFilterServiceType}>
          <SelectTrigger className="w-44" data-testid="select-filter-service-type"><SelectValue placeholder="Service Type" /></SelectTrigger>
          <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s === "all" ? "All Service Types" : s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterGsib} onValueChange={setFilterGsib}>
          <SelectTrigger className="w-32" data-testid="select-filter-gsib"><SelectValue placeholder="SIB Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Banks</SelectItem>
            <SelectItem value="G-SIB">G-SIB</SelectItem>
            <SelectItem value="D-SIB">D-SIB</SelectItem>
            <SelectItem value="N/A">N/A</SelectItem>
          </SelectContent>
        </Select>

        {/* Intel filter */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm" data-testid="intel-filter">
          <button
            data-testid="intel-filter-all"
            onClick={() => setFilterIntel("all")}
            className={`px-3 py-1.5 border-r border-slate-200 transition-colors ${filterIntel === "all" ? "bg-slate-700 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            All
          </button>
          <button
            data-testid="intel-filter-competitor"
            onClick={() => setFilterIntel(filterIntel === "competitor" ? "all" : "competitor")}
            className={`flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 transition-colors ${filterIntel === "competitor" ? "bg-orange-500 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            <Swords className="w-3 h-3" /> Competitor
          </button>
          <button
            data-testid="intel-filter-cb-provider"
            onClick={() => setFilterIntel(filterIntel === "cb_provider" ? "all" : "cb_provider")}
            className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${filterIntel === "cb_provider" ? "bg-violet-600 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            <Building2 className="w-3 h-3" /> CB Provider
          </button>
        </div>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-36" data-testid="select-sort-by"><SelectValue placeholder="Sort By" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name (A–Z)</SelectItem>
            <SelectItem value="country">Country (A–Z)</SelectItem>
            <SelectItem value="services">Services (Most)</SelectItem>
          </SelectContent>
        </Select>

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm" data-testid="mode-selector-providers">
          <button
            data-testid="mode-light-providers"
            title="Light: gpt-4o-mini, no web search, ~$0.01/group"
            onClick={() => { setJobMode("light"); setCurrencyScope("home_only"); }}
            className={`flex items-center gap-1 px-3 py-1.5 transition-colors border-r border-slate-200 ${
              jobMode === "light" ? "bg-amber-500 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Zap className="w-3 h-3" /> Light
          </button>
          <button
            data-testid="mode-normal-providers"
            title="Normal: gpt-4o, conditional web search, ~$0.07/group"
            onClick={() => setJobMode("normal")}
            className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${
              jobMode === "normal" ? "bg-blue-600 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Bot className="w-3 h-3" /> Normal
          </button>
        </div>

        {/* Scope selector — only for Normal mode */}
        {jobMode === "normal" && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm" data-testid="scope-selector-providers">
            {SCOPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                data-testid={`scope-${opt.value}-providers`}
                onClick={() => setCurrencyScope(opt.value)}
                className={`px-3 py-1.5 transition-colors border-r border-slate-200 last:border-r-0 ${
                  currencyScope === opt.value ? "bg-blue-600 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Market Coverage Scan panel */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" data-testid="market-scan-panel">
        <button
          data-testid="market-scan-toggle"
          onClick={() => setShowScanPanel(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-500" />
            <span>Market Coverage Scan</span>
            {jobs.filter(j => j.job_type === "market_scan").length > 0 && (
              <Badge className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 border-0">
                {jobs.filter(j => j.job_type === "market_scan").length} scan{jobs.filter(j => j.job_type === "market_scan").length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          {showScanPanel ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </button>

        {showScanPanel && (
          <div className="border-t border-slate-100 px-4 py-4 space-y-4">
            <p className="text-xs text-slate-500">
              Discover 8–15 active CB providers in a market. Creates banking groups, entities, BICs and one correspondent service per currency. No FMI memberships (deferred to CB Setup).
            </p>
            {/* Queue new scan */}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Country</label>
                <div className="relative">
                  <input
                    list="scan-country-list"
                    value={scanCountry}
                    onChange={e => handleScanCountryChange(e.target.value)}
                    placeholder="e.g. Canada"
                    className="h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    data-testid="scan-country-input"
                    autoComplete="off"
                  />
                  <datalist id="scan-country-list">
                    {Object.keys(SCAN_COUNTRY_CCY).map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Currency</label>
                <Select value={scanCurrency} onValueChange={setScanCurrency}>
                  <SelectTrigger className="w-28 h-9 text-sm" data-testid="scan-currency-select">
                    <SelectValue placeholder="CCY…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CB_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                data-testid="queue-market-scan"
                disabled={(!scanCountry && !scanCurrency) || marketScanMutation.isPending}
                onClick={() => {
                  const body: { market_country?: string; market_currency?: string; dry_run?: boolean } = {};
                  if (scanCountry) body.market_country = scanCountry;
                  if (scanCurrency) body.market_currency = scanCurrency;
                  if (scanDryRun) body.dry_run = true;
                  marketScanMutation.mutate(body);
                }}
                className="h-9 bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              >
                {marketScanMutation.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Queuing…</>
                  : <><Globe className="w-3.5 h-3.5" /> {scanDryRun ? "Queue Dry Run" : "Queue Scan"}</>}
              </Button>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none" data-testid="dry-run-toggle">
                <input
                  type="checkbox"
                  checked={scanDryRun}
                  onChange={e => setScanDryRun(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                Dry Run
              </label>
            </div>

            {/* Active + recent market scans */}
            {jobs.filter(j => j.job_type === "market_scan").length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Scan History</div>
                {jobs
                  .filter(j => j.job_type === "market_scan")
                  .slice()
                  .sort((a, b) => new Date(b.queued_at!).getTime() - new Date(a.queued_at!).getTime())
                  .map(job => (
                    <div key={job.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2" data-testid={`scan-job-${job.id}`}>
                      <div className="flex items-center gap-2.5">
                        <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="font-medium text-slate-800 text-sm">
                          {job.market_country} / {job.market_currency}
                        </span>
                        <JobStatusBadge job={job} />
                        {job.dry_run && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1 shrink-0" data-testid={`dry-run-badge-${job.id}`}>
                            <Zap className="w-3 h-3" /> Dry Run
                          </Badge>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          {job.status === "pending" && (
                            <button
                              title="Cancel"
                              className="text-slate-400 hover:text-red-500"
                              onClick={() => apiRequest("DELETE", `/api/jobs/${job.id}`).then(() => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }))}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {job.conversation_id && (
                            <button
                              className="text-xs text-blue-600 hover:text-blue-800 underline"
                              onClick={() => setLocation(`/agent?conv=${job.conversation_id}`)}
                            >
                              View transcript
                            </button>
                          )}
                        </div>
                      </div>
                      {job.status === "completed" && (() => {
                        let parsed: { summaryText?: string; dryRun?: boolean; newGroupIds?: string[]; newGroupNames?: string[]; createdCount?: number; updatedCount?: number } = {};
                        try { if (job.scan_summary) parsed = JSON.parse(job.scan_summary); } catch {}
                        const isDry = job.dry_run || parsed.dryRun;
                        const touchedGroups = (parsed.newGroupIds || []).map((id, i) => ({ id, name: (parsed.newGroupNames || [])[i] || id }));
                        const createdCount = parsed.createdCount ?? touchedGroups.length;
                        const updatedCount = parsed.updatedCount ?? 0;
                        return (
                          <div className="space-y-2">
                            {parsed.summaryText && (
                              <pre className={`text-xs whitespace-pre-wrap font-sans rounded border px-2.5 py-1.5 max-h-80 overflow-y-auto ${isDry ? "text-amber-800 bg-amber-50 border-amber-200" : "text-slate-600 bg-white border-slate-100"}`}>
                                {parsed.summaryText}
                              </pre>
                            )}
                            <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                              <span>{job.steps_completed} steps</span>
                              {!isDry && createdCount > 0 && <span>{createdCount} new groups</span>}
                              {!isDry && updatedCount > 0 && <span>{updatedCount} existing groups updated</span>}
                              {!isDry && (
                                <button
                                  className="text-blue-600 hover:text-blue-800 underline"
                                  onClick={() => { setSearch(job.market_country ?? ""); setShowScanPanel(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                                >
                                  Browse {job.market_country} groups →
                                </button>
                              )}
                              {isDry && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  data-testid={`run-for-real-${job.id}`}
                                  className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 gap-1"
                                  disabled={marketScanMutation.isPending}
                                  onClick={() => {
                                    setScanCountry(job.market_country ?? "");
                                    setScanCurrency(job.market_currency ?? "");
                                    setScanDryRun(false);
                                    marketScanMutation.mutate({
                                      market_country: job.market_country ?? undefined,
                                      market_currency: job.market_currency ?? undefined,
                                    });
                                  }}
                                >
                                  <Globe className="w-3 h-3" /> Run for real →
                                </Button>
                              )}
                            </div>
                            {!isDry && touchedGroups.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-slate-600">Touched providers — queue CB Setup:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {touchedGroups.map(g => (
                                    <button
                                      key={g.id}
                                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
                                      onClick={() => {
                                        apiRequest("POST", "/api/jobs", { banking_group_id: g.id, banking_group_name: g.name, currency_scope: "home_only", job_mode: "normal" })
                                          .then(() => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }))
                                          .then(() => toast({ title: "Job queued", description: `CB Setup queued for ${g.name}` }));
                                      }}
                                      data-testid={`queue-cb-setup-${g.id}`}
                                    >
                                      <Cpu className="w-3 h-3" /> {g.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {job.status === "failed" && job.error_message && (
                        <div className="text-xs text-red-500 truncate" title={job.error_message}>{job.error_message}</div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-sm text-slate-500">{filteredGroups.length} banking group{filteredGroups.length !== 1 ? "s" : ""}</div>

      {filteredGroups.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-slate-400 text-sm">No providers found. Use Database Admin to add banking groups.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedGroups.map(group => {
            const groupEntities = getEntitiesForGroup(group.id);
            const totalBics = groupEntities.flatMap(e => getBicsForEntity(e.id)).length;
            const totalServices = groupEntities.flatMap(e => getBicsForEntity(e.id)).flatMap(b => getServicesForBic(b.id)).length;
            const currencies = [...new Set(groupEntities.flatMap(e => getBicsForEntity(e.id)).flatMap(b => getServicesForBic(b.id)).map(s => s.currency).filter(Boolean))];
            const isSelected = selectedGroups.has(group.id);
            const job = jobByGroup(group.id);
            const isJobActive = job && (job.status === "pending" || job.status === "running");

            return (
              <Card
                key={group.id}
                className={`border shadow-sm overflow-hidden transition-colors ${isSelected ? "border-blue-400 bg-blue-50/30" : "border-slate-200"}`}
                data-testid={`card-group-${group.id}`}
              >
                <div className="flex items-center gap-2 p-4">
                  {/* Checkbox */}
                  <button
                    data-testid={`checkbox-group-${group.id}`}
                    title={isSelected ? "Deselect group" : "Select group"}
                    onClick={e => toggleGroupSelect(group.id, e)}
                    className="text-slate-400 hover:text-blue-600 transition-colors shrink-0"
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                  </button>

                  {/* Expand chevron */}
                  <button
                    className="text-slate-400 shrink-0"
                    onClick={() => toggleGroup(group.id)}
                    data-testid={`chevron-group-${group.id}`}
                  >
                    {expandedGroups[group.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  {/* Name + metadata */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleGroup(group.id)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{group.group_name}</span>
                      {group.gsib_status === "G-SIB" && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs"><ShieldCheck className="w-3 h-3 mr-1" />G-SIB</Badge>}
                      {group.gsib_status === "D-SIB" && <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs"><ShieldCheck className="w-3 h-3 mr-1" />D-SIB</Badge>}
                      {groupHasClsMember(group.id) && <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-xs"><Globe className="w-3 h-3 mr-1" />CLS</Badge>}
                      {group.rtgs_member && group.rtgs_system && <Badge className="bg-green-100 text-green-700 border-green-200 text-xs"><Radio className="w-3 h-3 mr-1" />{group.rtgs_system}</Badge>}
                      {group.cb_probability === "High" && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs"><TrendingUp className="w-3 h-3 mr-1" />CB: High</Badge>}
                      {group.cb_probability === "Medium" && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs"><TrendingUp className="w-3 h-3 mr-1" />CB: Med</Badge>}
                      {group.cb_probability === "Low" && <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs"><TrendingUp className="w-3 h-3 mr-1" />CB: Low</Badge>}
                      {getGroupIntel(group.id).some(o => o.obs_type === "competitor") && (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs" title="User-tagged as competitor"><Swords className="w-3 h-3 mr-1" />Competitor</Badge>
                      )}
                      {[...new Set(getGroupIntel(group.id).filter(o => o.obs_type === "cb_provider" && o.currency).map(o => o.currency))].map(ccy => (
                        <Badge key={ccy} className="bg-violet-100 text-violet-700 border-violet-200 text-xs" title="User-tagged as CB Provider"><Building2 className="w-3 h-3 mr-1" />CB: {ccy}</Badge>
                      ))}
                    </div>
                    {(group.headquarters_country || group.primary_currency) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {group.headquarters_country && <span className="text-xs text-slate-400">{group.headquarters_country}</span>}
                        {group.headquarters_country && group.primary_currency && <span className="text-xs text-slate-300">·</span>}
                        {group.primary_currency && <span className="font-mono text-xs text-blue-600">{group.primary_currency}</span>}
                      </div>
                    )}
                    {currencies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {currencies.slice(0, 10).map(c => <span key={c} className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">{c}</span>)}
                        {currencies.length > 10 && <span className="text-xs text-slate-400">+{currencies.length - 10}</span>}
                      </div>
                    )}
                  </div>

                  {/* Right side: stats + job status + actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right text-xs text-slate-400 hidden sm:block">
                      <div>{groupEntities.length} entit{groupEntities.length !== 1 ? "ies" : "y"}</div>
                      <div>{totalServices} svc{totalServices !== 1 ? "s" : ""}</div>
                    </div>

                    {job && <JobStatusBadge job={job} />}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      {isJobActive ? (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 w-7 p-0 text-slate-400 border-slate-200"
                          disabled
                          title="Job in progress…"
                        >
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm" variant="outline"
                            className="h-7 w-7 p-0 text-amber-600 border-amber-200 hover:bg-amber-50"
                            data-testid={`button-light-${group.id}`}
                            title="Light setup: gpt-4o-mini · no web search · ~$0.01"
                            disabled={queueMutation.isPending}
                            onClick={e => { e.stopPropagation(); queueMutation.mutate({ groupId: group.id, groupName: group.group_name, scope: "home_only", mode: "light" }); }}
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="h-7 w-7 p-0 text-blue-600 border-blue-200 hover:bg-blue-50"
                            data-testid={`button-normal-${group.id}`}
                            title={`Normal setup: gpt-4o · web search · ${SCOPE_LABELS[currencyScope]}`}
                            disabled={queueMutation.isPending}
                            onClick={e => { e.stopPropagation(); queueMutation.mutate({ groupId: group.id, groupName: group.group_name, scope: currencyScope, mode: "normal" }); }}
                          >
                            <Bot className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                        data-testid={`button-open-agent-${group.id}`}
                        title="Open in agent chat"
                        onClick={e => {
                          e.stopPropagation();
                          const prompt = buildAgentPrompt(group, groupEntities.length, totalBics, totalServices);
                          setLocation(`/agent?prompt=${encodeURIComponent(prompt)}&conv=${encodeURIComponent(`CB Setup: ${group.group_name}`)}`);
                        }}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-violet-400 hover:text-violet-600"
                        data-testid={`button-add-intel-${group.id}`}
                        title="Add intel (competitor / CB provider)"
                        onClick={e => openGroupIntelDialog(group, e)}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Expanded: group metadata + entities */}
                {expandedGroups[group.id] && (
                  <div className="border-t border-slate-100">
                    {(group.rtgs_system || group.cb_probability || group.cb_evidence) && (
                      <div className="px-8 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-4 text-xs text-slate-600">
                        {group.rtgs_system && <span><span className="font-medium text-slate-500">RTGS:</span> {group.rtgs_system} {group.rtgs_member ? "✅ Member" : "⚠️ Unconfirmed"}</span>}
                        {group.cb_probability && <span><span className="font-medium text-slate-500">CB Probability:</span> {group.cb_probability}</span>}
                        {group.cb_evidence && <span className="flex-1 text-slate-500 italic">{group.cb_evidence}</span>}
                      </div>
                    )}

                    {/* Intel list for group */}
                    {getGroupIntel(group.id).length > 0 && (
                      <div className="px-8 py-2 bg-violet-50/40 border-b border-violet-100 space-y-1.5">
                        <div className="text-xs font-medium text-violet-700 mb-1">Intel</div>
                        {getGroupIntel(group.id).map(obs => (
                          <div key={obs.id} className="flex items-center gap-2 text-xs">
                            {obs.obs_type === "competitor"
                              ? <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs shrink-0"><Swords className="w-2.5 h-2.5 mr-1" />Competitor</Badge>
                              : <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs shrink-0"><Building2 className="w-2.5 h-2.5 mr-1" />CB: {obs.currency}</Badge>
                            }
                            {obs.notes && <span className="text-slate-500 italic truncate">{obs.notes}</span>}
                            <span className="text-slate-300 shrink-0 ml-auto flex items-center gap-1">
                              {obs.source_type === "user" ? <User className="w-2.5 h-2.5" /> : <BotIcon className="w-2.5 h-2.5" />}
                              {obs.source_detail && <span>{obs.source_detail}</span>}
                            </span>
                            <button
                              data-testid={`delete-intel-${obs.id}`}
                              title="Delete"
                              onClick={() => deleteIntelMutation.mutate(obs.id)}
                              className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {groupEntities.length === 0 ? (
                      <div className="px-8 py-4 text-slate-400 text-sm">No legal entities for this group.</div>
                    ) : (
                      groupEntities.map(entity => {
                        const entityBics = getBicsForEntity(entity.id);
                        const isEntitySelected = selectedEntities.has(entity.id);
                        const entityIntel = getEntityIntel(entity.id);
                        return (
                          <div key={entity.id} className={`border-b border-slate-50 last:border-0 ${isEntitySelected ? "bg-blue-50/40" : ""}`}>
                            <div
                              className="flex items-center gap-2 px-6 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                              onClick={() => toggleEntity(entity.id)}
                            >
                              {/* Entity checkbox */}
                              <button
                                data-testid={`checkbox-entity-${entity.id}`}
                                title={isEntitySelected ? "Deselect entity" : "Select entity"}
                                onClick={e => toggleEntitySelect(entity.id, e)}
                                className="text-slate-300 hover:text-blue-500 transition-colors shrink-0"
                              >
                                {isEntitySelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> : <Square className="w-3.5 h-3.5" />}
                              </button>

                              {expandedEntities[entity.id]
                                ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                                : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}

                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-slate-800">{entity.legal_name}</span>
                                  {isEntityClsMember(entity.id) && <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-xs"><Globe className="w-3 h-3 mr-1" />CLS</Badge>}
                                  {entity.entity_type && <Badge variant="outline" className="text-xs">{entity.entity_type}</Badge>}
                                  {[...new Set(entityIntel.filter(o => o.obs_type === "cb_provider" && o.currency).map(o => o.currency))].map(ccy => (
                                    <Badge key={ccy} className="bg-violet-100 text-violet-700 border-violet-200 text-xs"><Building2 className="w-2.5 h-2.5 mr-1" />CB: {ccy}</Badge>
                                  ))}
                                </div>
                                {entity.country && <span className="text-xs text-slate-400">{entity.country}</span>}
                              </div>
                              <span className="text-xs text-slate-400 shrink-0">{entityBics.length} BIC{entityBics.length !== 1 ? "s" : ""}</span>
                              <button
                                data-testid={`button-entity-intel-${entity.id}`}
                                title="Add CB Provider intel for this entity"
                                onClick={e => openEntityIntelDialog(group, entity, e)}
                                className="text-violet-300 hover:text-violet-600 transition-colors shrink-0"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Entity intel list */}
                            {entityIntel.length > 0 && (
                              <div className="px-14 pb-2 space-y-1">
                                {entityIntel.map(obs => (
                                  <div key={obs.id} className="flex items-center gap-2 text-xs">
                                    <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs shrink-0"><Building2 className="w-2.5 h-2.5 mr-1" />CB: {obs.currency}</Badge>
                                    {obs.notes && <span className="text-slate-500 italic truncate">{obs.notes}</span>}
                                    <span className="text-slate-300 shrink-0 ml-auto flex items-center gap-1">
                                      {obs.source_type === "user" ? <User className="w-2.5 h-2.5" /> : <BotIcon className="w-2.5 h-2.5" />}
                                      {obs.source_detail && <span>{obs.source_detail}</span>}
                                    </span>
                                    <button
                                      data-testid={`delete-intel-${obs.id}`}
                                      title="Delete"
                                      onClick={() => deleteIntelMutation.mutate(obs.id)}
                                      className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {expandedEntities[entity.id] && (
                              <div className="px-12 pb-3">
                                {entityBics.length === 0 ? (
                                  <p className="text-slate-400 text-sm">No BICs registered.</p>
                                ) : (
                                  entityBics.map(bic => {
                                    const bicServices = getServicesForBic(bic.id);
                                    return (
                                      <div key={bic.id} className="mb-3 bg-slate-50 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="font-mono font-bold text-slate-800">{bic.bic_code}</span>
                                          <span className="text-xs text-slate-500">{bic.city}{bic.city && bic.country ? ", " : ""}{bic.country}</span>
                                          {bic.is_headquarters && <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">HQ</Badge>}
                                        </div>
                                        {bicServices.length === 0 ? (
                                          <p className="text-slate-400 text-xs">No services recorded.</p>
                                        ) : (
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="text-slate-500">
                                                  <th className="text-left py-1 pr-3">Currency</th>
                                                  <th className="text-left py-1 pr-3">Service</th>
                                                  <th className="text-left py-1 pr-3">Model</th>
                                                  <th className="text-center py-1 pr-3">RTGS</th>
                                                  <th className="text-center py-1 pr-3">Instant</th>
                                                  <th className="text-left py-1">Target Clients</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {bicServices.map(svc => (
                                                  <tr key={svc.id} className="border-t border-slate-200">
                                                    <td className="py-1 pr-3 font-semibold text-slate-700">{svc.currency}</td>
                                                    <td className="py-1 pr-3 text-slate-600">{svc.service_type}</td>
                                                    <td className="py-1 pr-3">
                                                      {svc.clearing_model
                                                        ? <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${svc.clearing_model === "Onshore" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{svc.clearing_model}</span>
                                                        : "—"}
                                                    </td>
                                                    <td className="py-1 pr-3 text-center">{svc.rtgs_membership ? "✓" : "—"}</td>
                                                    <td className="py-1 pr-3 text-center">{svc.instant_scheme_access ? "✓" : "—"}</td>
                                                    <td className="py-1 text-slate-500">{svc.target_clients || "—"}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Floating selection action bar */}
      {hasSelection && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl px-4 py-2.5 flex items-center gap-3 flex-wrap max-w-2xl"
          data-testid="selection-action-bar"
        >
          <span className="text-sm text-slate-600 font-medium whitespace-nowrap">
            {selectedGroups.size > 0 && `${selectedGroups.size} group${selectedGroups.size !== 1 ? "s" : ""}`}
            {selectedGroups.size > 0 && selectedEntities.size > 0 && " · "}
            {selectedEntities.size > 0 && `${selectedEntities.size} entit${selectedEntities.size !== 1 ? "ies" : "y"}`}
          </span>

          {selectedGroups.size > 0 && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white gap-1"
                data-testid="batch-queue-light"
                disabled={queueAllMutation.isPending}
                onClick={() => queueAllMutation.mutate({
                  groupIds: selectedGroupObjects.map(g => ({ id: g.id, name: g.group_name })),
                  scope: "home_only",
                  mode: "light",
                })}
              >
                <Zap className="w-3 h-3" /> Queue Light ({selectedGroups.size})
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
                data-testid="batch-queue-normal"
                disabled={queueAllMutation.isPending}
                onClick={() => queueAllMutation.mutate({
                  groupIds: selectedGroupObjects.map(g => ({ id: g.id, name: g.group_name })),
                  scope: currencyScope,
                  mode: jobMode,
                })}
              >
                <Bot className="w-3 h-3" /> Queue Normal ({selectedGroups.size})
              </Button>
              {selectedGroups.size === 2 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-slate-300 text-slate-700 hover:bg-slate-50 gap-1"
                  data-testid="batch-merge-groups"
                  onClick={openGroupMergeDialog}
                >
                  Merge Groups
                </Button>
              )}
            </>
          )}

          {selectedEntities.size === 2 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-slate-300 text-slate-700 hover:bg-slate-50 gap-1"
              data-testid="batch-merge-entities"
              onClick={openEntityMergeDialog}
            >
              Merge Entities
            </Button>
          )}

          <button
            data-testid="clear-selection"
            title="Clear selection"
            onClick={clearSelection}
            className="ml-auto text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Intel dialog */}
      <Dialog open={!!intelDialog} onOpenChange={open => { if (!open) setIntelDialog(null); }}>
        <DialogContent className="max-w-sm" data-testid="intel-dialog">
          <DialogHeader>
            <DialogTitle>Add Intel</DialogTitle>
          </DialogHeader>
          {intelDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-500">
                {intelDialog.type === "entity"
                  ? <>For <span className="font-medium text-slate-800">{intelDialog.entityName}</span></>
                  : <>For <span className="font-medium text-slate-800">{intelDialog.groupName}</span></>
                }
              </p>

              {intelDialog.type === "group" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Type <span className="text-slate-400 font-normal">(select one or both)</span></label>
                  <div className="flex gap-2">
                    <button
                      data-testid="intel-type-competitor"
                      onClick={() => setIntelIsCompetitor(p => !p)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${intelIsCompetitor ? "bg-orange-500 border-orange-500 text-white font-medium" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      <Swords className="w-3.5 h-3.5" /> Competitor
                    </button>
                    <button
                      data-testid="intel-type-cb-provider"
                      onClick={() => { setIntelIsCbProvider(p => !p); if (intelIsCbProvider) setIntelCurrency(""); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${intelIsCbProvider ? "bg-violet-600 border-violet-600 text-white font-medium" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      <Building2 className="w-3.5 h-3.5" /> CB Provider
                    </button>
                  </div>
                </div>
              )}

              {(intelIsCbProvider || intelDialog.type === "entity") && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Currency <span className="text-red-500">*</span></label>
                  <Select value={intelCurrency} onValueChange={setIntelCurrency}>
                    <SelectTrigger data-testid="intel-currency-select">
                      <SelectValue placeholder="Select currency…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CB_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Notes <span className="text-slate-400">(optional)</span></label>
                <Textarea
                  data-testid="intel-notes"
                  placeholder="e.g. confirmed by FX desk as EUR clearing provider"
                  className="text-sm resize-none"
                  rows={3}
                  value={intelNotes}
                  onChange={e => setIntelNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIntelDialog(null)}>Cancel</Button>
            <Button
              data-testid="confirm-add-intel"
              disabled={addIntelMutation.isPending}
              onClick={submitIntel}
              className={intelIsCompetitor && intelIsCbProvider ? "bg-slate-700 hover:bg-slate-800" : intelIsCompetitor ? "bg-orange-500 hover:bg-orange-600" : "bg-violet-600 hover:bg-violet-700"}
            >
              {addIntelMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saving…</> : "Save Intel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge confirmation dialog */}
      <Dialog open={!!mergeDialog} onOpenChange={open => { if (!open) setMergeDialog(null); }}>
        <DialogContent className="max-w-md" data-testid="merge-dialog">
          <DialogHeader>
            <DialogTitle>
              {mergeDialog?.type === "group" ? "Merge Banking Groups" : "Merge Legal Entities"}
            </DialogTitle>
          </DialogHeader>
          {mergeDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-600">
                The record marked <span className="font-medium text-red-600">Delete</span> will be permanently removed.
                All its data (entities, BICs, FMI records) will be moved to the <span className="font-medium text-emerald-700">Keeper</span>.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide mb-0.5">Keep</div>
                    <div className="text-sm font-medium text-slate-900">{mergeDialog.keepName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-red-200 bg-red-50">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs font-medium text-red-600 uppercase tracking-wide mb-0.5">Delete</div>
                    <div className="text-sm font-medium text-slate-900">{mergeDialog.deleteName}</div>
                  </div>
                </div>
              </div>
              <button
                className="text-xs text-slate-400 hover:text-slate-600 underline"
                onClick={swapMergeDialog}
              >
                Swap keeper / deleted
              </button>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMergeDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              data-testid="confirm-merge"
              disabled={mergeGroupsMutation.isPending || mergeEntitiesMutation.isPending}
              onClick={confirmMerge}
            >
              {(mergeGroupsMutation.isPending || mergeEntitiesMutation.isPending)
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Merging…</>
                : "Confirm Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
