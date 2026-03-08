import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertCircle, XCircle, Bot, Search, ShieldCheck, Clock, Loader2, ExternalLink, Trash2, Play, StopCircle, RefreshCw, Zap, Swords, Building2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { BankingGroup, LegalEntity, Bic, CorrespondentService, AgentJob, IntelObservation } from "@shared/schema";

type CoverageStatus = "complete" | "partial" | "empty";
type CurrencyScope = "home_only" | "major" | "all";

const SCOPE_OPTIONS: { value: CurrencyScope; label: string; desc: string }[] = [
  { value: "home_only", label: "Home currency", desc: "Only the group's primary currency (e.g. EUR for a Eurozone bank)" },
  { value: "major",    label: "EUR / GBP / USD",  desc: "The three major correspondent banking currencies only" },
  { value: "all",      label: "All currencies",  desc: "Every currency the entity is known to offer CB services in" },
];

const SCOPE_LABELS: Record<CurrencyScope, string> = {
  home_only: "Home",
  major:     "EUR/GBP/USD",
  all:       "All CCY",
};

const CLS_CURRENCIES = new Set(["AUD","CAD","CHF","DKK","EUR","GBP","HKD","JPY","MXN","NOK","NZD","SEK","SGD","USD","ILS","ZAR","KRW","HUF"]);

function buildCurrencyInstruction(scope: CurrencyScope, primaryCurrency?: string | null): string {
  switch (scope) {
    case "home_only":
      return `For each BIC, ensure a Correspondent Banking service exists in the home currency${primaryCurrency ? ` (${primaryCurrency})` : ""} only. Do not create services for other currencies — strictly limit to the home currency.`;
    case "major":
      return `For each BIC, focus only on EUR, GBP, and USD correspondent banking services. Only create services for these three currencies; skip the home currency if it is not one of these three.`;
    case "all":
      return `For each BIC, identify and add all currencies that entity is known to offer Correspondent Banking services in. Include the home currency${primaryCurrency ? ` (${primaryCurrency})` : ""} plus any additional currencies confirmed through research.`;
  }
}

function buildCBSetupPrompt(group: BankingGroup, entityCount: number, bicCount: number, serviceCount: number, scope: CurrencyScope): string {
  const currencyInstruction = buildCurrencyInstruction(scope, group.primary_currency);
  const scopeLabel = scope === "home_only" ? "home currency only" : scope === "major" ? "EUR/GBP/USD" : "all currencies";
  const rtgsLabel = group.rtgs_system || (group.primary_currency ? `identify RTGS for ${group.primary_currency}` : "not identified");
  const rtgsMemberKnown = !!group.rtgs_member && !!group.rtgs_system;

  const step2 = entityCount > 0
    ? `STEP 2 — IDENTIFY CORRESPONDENT BANKING LEGAL ENTITIES
${entityCount} entit${entityCount !== 1 ? "ies are" : "y is"} already recorded for this group. DO NOT run a web search.
Use find_legal_entity_by_name to get the ID for each known entity, then update any missing fields (country, entity_type) with update_legal_entity if needed.`
    : `STEP 2 — IDENTIFY CORRESPONDENT BANKING LEGAL ENTITIES
No entities recorded yet. Run ONE search: "${group.group_name} correspondent banking SWIFT BIC legal entity".
Target ONLY: (a) the primary HQ licensed banking entity, (b) dedicated CB-hub subsidiaries.
For each candidate: use find_legal_entity_by_name to confirm before creating.
• Not found → create with create_legal_entity linked to group_id ${group.id}.`;

  const step5FmiLines = [
    `• SWIFT (fmi_type "Messaging Networks") — Record directly without searching; all major international banks are SWIFT members.`,
    rtgsMemberKnown
      ? `• ${rtgsLabel} (fmi_type "Payment Systems") — RTGS membership is already confirmed; record directly without searching.`
      : `• ${rtgsLabel} (fmi_type "Payment Systems") — Run ONE search: "${group.group_name} ${rtgsLabel} direct participant" to confirm, then record.`,
    group.primary_currency && CLS_CURRENCIES.has(group.primary_currency)
      ? `• CLS (fmi_type "FX Settlement Systems") — ${group.primary_currency} is CLS-eligible. Run ONE search to confirm direct settlement membership, then record.`
      : ``,
  ].filter(Boolean).join("\n");

  return `Run the CB Entity Setup workflow for ${group.group_name}${group.headquarters_country ? ` (${group.headquarters_country})` : ""} [Scope: ${scopeLabel}]
Group ID: ${group.id} | Home currency: ${group.primary_currency || "not set"} | RTGS: ${rtgsLabel} | RTGS member: ${rtgsMemberKnown ? "yes" : "unconfirmed"} | CB probability: ${group.cb_probability || "not set"}
Current DB state: ${entityCount} legal entit${entityCount !== 1 ? "ies" : "y"}, ${bicCount} BIC${bicCount !== 1 ? "s" : ""}, ${serviceCount} service${serviceCount !== 1 ? "s" : ""} recorded.

---
STEP 1 — VERIFY BANKING GROUP RECORD
The field values above are current. Only call update_banking_group (ID: ${group.id}) if a field shows "not set" — research the missing value first, then update.

---
${step2}

---
STEP 3 — BIC CODES
For every entity: use list_bics to check if a BIC is already linked.
• BIC exists → use its ID; update any missing fields with update_bic.
• Missing → add with create_bic. Set is_headquarters=true and swift_member=true for the primary HQ entity's BIC.

---
STEP 4 — CORRESPONDENT SERVICES
${currencyInstruction}
Before creating any service: call list_correspondent_services and confirm no existing record exists for that BIC + currency combination.
• Exists → update with any missing details using update_correspondent_service; do NOT create a duplicate.
• Missing → create with create_correspondent_service. bic_id must be a real UUID obtained from list_bics.
For clearing_model AND service_type, use the entity's actual country — NOT the banking group's home currency:
• Onshore ONLY if this entity's country is the home country/region of that currency's settlement infrastructure → service_type = "Correspondent Banking"
• All other combinations → Offshore → service_type = "Global Currency Clearing"
TRAP TO AVOID: Do NOT mark a service Onshore just because the currency matches the group's primary_currency. A foreign subsidiary offering its parent's home currency is still Offshore with service_type "Global Currency Clearing" (e.g. a US bank's Irish entity offering USD = Offshore / Global Currency Clearing, a UK bank's UK entity offering EUR = Offshore / Global Currency Clearing).

---
STEP 5 — FMI MEMBERSHIPS
For the primary HQ entity, check and record the following (call check_fmi_membership before each create_fmi):
${step5FmiLines}

---
Work all 5 steps fully. End with a summary: entities added/updated | BICs added | services created | FMI memberships recorded | web searches performed | any issues.`;
}

const statusConfig: Record<CoverageStatus, { label: string; icon: React.ReactNode; badge: string }> = {
  complete: { label: "Complete", icon: <CheckCircle2 className="w-3.5 h-3.5" />, badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  partial:  { label: "Partial",  icon: <AlertCircle  className="w-3.5 h-3.5" />, badge: "bg-amber-100 text-amber-700 border-amber-200"   },
  empty:    { label: "Empty",    icon: <XCircle      className="w-3.5 h-3.5" />, badge: "bg-red-100 text-red-700 border-red-200"          },
};

function JobStatusBadge({ job }: { job: AgentJob }) {
  const scope = (job.currency_scope || "home_only") as CurrencyScope;
  const scopeLabel = SCOPE_LABELS[scope];
  const isLight = (job as any).job_mode === "light";
  const modeLabel = isLight ? "Light (gpt-4o-mini)" : "Normal (gpt-4o)";
  const tooltip = `${modeLabel} · ${scopeLabel}`;

  if (job.status === "pending") return (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs gap-1" title={tooltip}>
      {isLight ? <Zap className="w-3 h-3 text-amber-500" /> : <Clock className="w-3 h-3" />} Queued
    </Badge>
  );
  if (job.status === "running") return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs gap-1" title={tooltip}>
      <Loader2 className="w-3 h-3 animate-spin" /> Running {job.steps_completed ? `(${job.steps_completed})` : ""}
    </Badge>
  );
  if (job.status === "completed") return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1" title={tooltip}>
      <CheckCircle2 className="w-3 h-3" /> Done ({job.steps_completed})
    </Badge>
  );
  if (job.status === "failed") return (
    <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1" title={`${tooltip}${job.error_message ? ` · ${job.error_message}` : ""}`}>
      <XCircle className="w-3 h-3" /> Failed
    </Badge>
  );
  return null;
}

type JobMode = "light" | "normal";

export default function Coverage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<CoverageStatus | "all">("all");
  const [currencyScope, setCurrencyScope] = useState<CurrencyScope>("home_only");
  const [jobMode, setJobMode] = useState<JobMode>("normal");
  const { toast } = useToast();

  const { data: groups = [], isLoading: lg } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: entities = [], isLoading: le } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: bics = [], isLoading: lb } = useQuery<Bic[]>({ queryKey: ["/api/bics"] });
  const { data: services = [], isLoading: ls } = useQuery<CorrespondentService[]>({ queryKey: ["/api/correspondent-services"] });
  const { data: intel = [] } = useQuery<IntelObservation[]>({ queryKey: ["/api/intel"] });
  const { data: jobs = [] } = useQuery<AgentJob[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: (query) => {
      const data = query.state.data as AgentJob[] | undefined;
      const hasActive = data?.some(j => j.status === "pending" || j.status === "running");
      return hasActive ? 5000 : 15000;
    },
  });

  const queueMutation = useMutation({
    mutationFn: (vars: { group: BankingGroup; scope: CurrencyScope; mode: JobMode }) =>
      apiRequest("POST", "/api/jobs", {
        banking_group_id: vars.group.id,
        banking_group_name: vars.group.group_name,
        currency_scope: vars.scope,
        job_mode: vars.mode,
      }).then(r => r.json()),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Job queued", description: vars.mode === "light" ? "Light Setup queued (~$0.01)." : "Normal Setup queued." });
    },
    onError: (err: any) => {
      toast({ title: "Could not queue job", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("DELETE", `/api/jobs/${jobId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }),
    onError: (err: any) => toast({ title: "Cannot cancel", description: err.message, variant: "destructive" }),
  });

  const queueAllMutation = useMutation({
    mutationFn: (vars: { groupIds: { id: string; name: string }[]; scope: CurrencyScope; mode: JobMode }) =>
      apiRequest("POST", "/api/jobs/queue-all", { group_ids: vars.groupIds, currency_scope: vars.scope, job_mode: vars.mode }).then(r => r.json()),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: `${data.queued} jobs queued`, description: vars.mode === "light" ? `Light mode (~$0.01/group)` : "Normal mode. Runner processes one at a time." });
    },
    onError: (err: any) => toast({ title: "Queue all failed", description: err.message, variant: "destructive" }),
  });

  const stopQueueMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/jobs/stop-queue").then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: `Queue stopped`, description: `${data.stopped} pending job${data.stopped !== 1 ? "s" : ""} cancelled.` });
    },
    onError: (err: any) => toast({ title: "Could not stop queue", description: err.message, variant: "destructive" }),
  });

  const loading = lg || le || lb || ls;

  const getStatus = (groupId: string): CoverageStatus => {
    const groupEntities = entities.filter(e => e.group_id === groupId);
    if (groupEntities.length === 0) return "empty";
    const groupBics = groupEntities.flatMap(e => bics.filter(b => b.legal_entity_id === e.id));
    if (groupBics.length === 0) return "partial";
    const groupServices = groupBics.flatMap(b => services.filter(s => s.bic_id === b.id));
    if (groupServices.length === 0) return "partial";
    return "complete";
  };

  const jobByGroup = (groupId: string): AgentJob | undefined => {
    const groupJobs = jobs.filter(j => j.banking_group_id === groupId);
    return groupJobs.sort((a, b) => new Date(b.queued_at!).getTime() - new Date(a.queued_at!).getTime())[0];
  };

  const getGroupIntel = (groupId: string) => intel.filter(o => o.banking_group_id === groupId);

  const enrichedGroups = groups.map(g => {
    const groupEntities = entities.filter(e => e.group_id === g.id);
    const groupBics = groupEntities.flatMap(e => bics.filter(b => b.legal_entity_id === e.id));
    const groupServices = groupBics.flatMap(b => services.filter(s => s.bic_id === b.id));
    return {
      group: g,
      entityCount: groupEntities.length,
      bicCount: groupBics.length,
      serviceCount: groupServices.length,
      status: getStatus(g.id),
      job: jobByGroup(g.id),
    };
  });

  const completeCount = enrichedGroups.filter(r => r.status === "complete").length;
  const partialCount  = enrichedGroups.filter(r => r.status === "partial").length;
  const emptyCount    = enrichedGroups.filter(r => r.status === "empty").length;
  const activeJobCount = jobs.filter(j => j.status === "pending" || j.status === "running").length;

  const filtered = enrichedGroups.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.group.group_name?.toLowerCase().includes(q) || r.group.headquarters_country?.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    const order: Record<CoverageStatus, number> = { empty: 0, partial: 1, complete: 2 };
    const diff = order[a.status] - order[b.status];
    if (diff !== 0) return diff;
    return (a.group.group_name || "").localeCompare(b.group.group_name || "");
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64" data-testid="loading-coverage">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  const emptyGroups      = enrichedGroups.filter(r => r.status === "empty").map(r => ({ id: r.group.id, name: r.group.group_name }));
  const incompleteGroups = enrichedGroups.filter(r => r.status !== "complete").map(r => ({ id: r.group.id, name: r.group.group_name }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Coverage</h1>
          <p className="text-slate-500 text-sm mt-1">Track which banking groups have complete data chains: entity → BIC → service</p>
        </div>
        {activeJobCount > 0 && (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1 self-center">
            <Loader2 className="w-3 h-3 animate-spin" /> {activeJobCount} job{activeJobCount !== 1 ? "s" : ""} running
          </Badge>
        )}
      </div>

      {/* Job Configuration Panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        {/* Row 1: Mode + Scope selectors */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Mode selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Mode:</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm" data-testid="mode-selector">
              <button
                data-testid="mode-option-light"
                title="Light: gpt-4o-mini, no web search, DB-only. ~$0.01/group. User reviews results."
                onClick={() => { setJobMode("light"); setCurrencyScope("home_only"); }}
                className={`flex items-center gap-1 px-3 py-1.5 transition-colors border-r border-slate-200 ${
                  jobMode === "light"
                    ? "bg-amber-500 text-white font-medium"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Zap className="w-3 h-3" /> Light
              </button>
              <button
                data-testid="mode-option-normal"
                title="Normal: gpt-4o, conditional web searches. ~$0.07/group."
                onClick={() => setJobMode("normal")}
                className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${
                  jobMode === "normal"
                    ? "bg-blue-600 text-white font-medium"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Bot className="w-3 h-3" /> Normal
              </button>
            </div>
            <span className="text-xs text-slate-400 italic">
              {jobMode === "light" ? "gpt-4o-mini · no web search · ~$0.01/group" : "gpt-4o · conditional search · ~$0.07/group"}
            </span>
          </div>
          {/* Scope selector — disabled in light mode */}
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium whitespace-nowrap ${jobMode === "light" ? "text-slate-400" : "text-slate-700"}`}>Scope:</span>
            <div className={`flex rounded-lg border overflow-hidden text-sm ${jobMode === "light" ? "border-slate-100 opacity-40 pointer-events-none" : "border-slate-200"}`} data-testid="scope-selector">
              {SCOPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  data-testid={`scope-option-${opt.value}`}
                  title={jobMode === "light" ? "Light mode always uses home currency only" : opt.desc}
                  onClick={() => setCurrencyScope(opt.value)}
                  className={`px-3 py-1.5 transition-colors border-r border-slate-200 last:border-r-0 ${
                    currencyScope === opt.value
                      ? "bg-blue-600 text-white font-medium"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {jobMode === "light" && <span className="text-xs text-amber-600 italic">locked to Home in Light mode</span>}
          </div>
        </div>
        {/* Row 2: Action buttons */}
        <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100 items-center">
          <Button
            size="sm"
            variant="outline"
            className="text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
            data-testid="button-queue-all-empty"
            disabled={queueAllMutation.isPending || emptyGroups.length === 0}
            onClick={() => queueAllMutation.mutate({ groupIds: emptyGroups, scope: currencyScope, mode: jobMode })}
          >
            {jobMode === "light" ? <Zap className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Queue Empty ({emptyGroups.length})
          </Button>
          <Button
            size="sm"
            className={`text-xs ${jobMode === "light" ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700"}`}
            data-testid="button-queue-all-incomplete"
            disabled={queueAllMutation.isPending || incompleteGroups.length === 0}
            onClick={() => queueAllMutation.mutate({ groupIds: incompleteGroups, scope: currencyScope, mode: jobMode })}
          >
            {jobMode === "light" ? <Zap className="w-3.5 h-3.5 mr-1" /> : <Bot className="w-3.5 h-3.5 mr-1" />}
            Queue All Incomplete ({incompleteGroups.length})
          </Button>
          {jobs.filter(j => j.status === "pending").length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-red-200 text-red-600 hover:bg-red-50 ml-auto"
              data-testid="button-stop-queue"
              disabled={stopQueueMutation.isPending}
              onClick={() => stopQueueMutation.mutate()}
            >
              <StopCircle className="w-3.5 h-3.5 mr-1" />
              Stop Queue ({jobs.filter(j => j.status === "pending").length} pending)
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { status: "complete" as CoverageStatus, count: completeCount, label: "Complete", desc: "Entity + BIC + Service" },
          { status: "partial"  as CoverageStatus, count: partialCount,  label: "Partial",  desc: "Missing BIC or Service" },
          { status: "empty"    as CoverageStatus, count: emptyCount,    label: "Empty",    desc: "No entities yet" },
        ].map(s => (
          <button
            key={s.status}
            data-testid={`card-coverage-${s.status}`}
            onClick={() => setFilterStatus(filterStatus === s.status ? "all" : s.status)}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              filterStatus === s.status
                ? s.status === "complete" ? "border-emerald-500 bg-emerald-50"
                : s.status === "partial"  ? "border-amber-400 bg-amber-50"
                : "border-red-400 bg-red-50"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {statusConfig[s.status].icon}
              <span className="font-semibold text-slate-900 text-xl">{s.count}</span>
            </div>
            <div className="text-sm font-medium text-slate-700">{s.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.desc}</div>
          </button>
        ))}
      </div>

      {/* Search / Count */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            data-testid="input-search-coverage"
            placeholder="Search banking groups..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="text-sm text-slate-500 flex items-center">{filtered.length} of {groups.length} groups</div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-600">Banking Group</th>
              <th className="text-center px-3 py-3 font-medium text-slate-600" title="Entities / BICs / Services">E / B / S</th>
              <th className="text-left px-3 py-3 font-medium text-slate-600">Coverage</th>
              <th className="text-left px-3 py-3 font-medium text-slate-600">Job</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ group, entityCount, bicCount, serviceCount, status, job }, i) => {
              const isActive = job && (job.status === "pending" || job.status === "running");
              return (
                <tr
                  key={group.id}
                  data-testid={`row-coverage-${group.id}`}
                  className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50 ${i % 2 === 0 ? "" : "bg-slate-50/30"}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">{group.group_name}</span>
                      {group.gsib_status === "G-SIB" && (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs py-0 h-5">
                          <ShieldCheck className="w-3 h-3 mr-1" />G-SIB
                        </Badge>
                      )}
                      {(() => {
                        const groupIntel = getGroupIntel(group.id);
                        const isCompetitor = groupIntel.some(o => o.obs_type === "competitor");
                        const cbCurrencies = [...new Set(groupIntel.filter(o => o.obs_type === "cb_provider" && o.currency).map(o => o.currency))];
                        const tooltip = groupIntel.map(o => `${o.obs_type === "competitor" ? "Competitor" : `CB Provider (${o.currency})`}${o.notes ? `: ${o.notes}` : ""}`).join(" · ");
                        return <>
                          {isCompetitor && (
                            <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs py-0 h-5" title={tooltip}>
                              <Swords className="w-3 h-3 mr-1" />Competitor
                            </Badge>
                          )}
                          {cbCurrencies.length > 0 && (
                            <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs py-0 h-5" title={tooltip}>
                              <Building2 className="w-3 h-3 mr-1" />CB{cbCurrencies.length === 1 ? `: ${cbCurrencies[0]}` : ` ×${cbCurrencies.length}`}
                            </Badge>
                          )}
                        </>;
                      })()}
                    </div>
                    {(group.headquarters_country || group.primary_currency) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {group.headquarters_country && (
                          <span className="text-xs text-slate-400">{group.headquarters_country}</span>
                        )}
                        {group.headquarters_country && group.primary_currency && (
                          <span className="text-xs text-slate-300">·</span>
                        )}
                        {group.primary_currency && (
                          <span className="font-mono text-xs text-blue-600">{group.primary_currency}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center" title="Entities / BICs / Services">
                    <span className="font-mono text-xs text-slate-500 whitespace-nowrap">
                      <span className={entityCount > 0 ? "text-slate-700 font-medium" : ""}>{entityCount}</span>
                      <span className="text-slate-300 mx-0.5">/</span>
                      <span className={bicCount > 0 ? "text-slate-700 font-medium" : ""}>{bicCount}</span>
                      <span className="text-slate-300 mx-0.5">/</span>
                      <span className={serviceCount > 0 ? "text-slate-700 font-medium" : ""}>{serviceCount}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Badge className={`${statusConfig[status].badge} text-xs gap-1`} data-testid={`status-${group.id}`}>
                      {statusConfig[status].icon}
                      {statusConfig[status].label}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    {job ? <JobStatusBadge job={job} /> : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      {isActive ? (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 w-7 p-0 text-red-500 border-red-200 hover:bg-red-50"
                          data-testid={`button-cancel-job-${group.id}`}
                          title="Cancel job"
                          onClick={() => job && cancelMutation.mutate(job.id)}
                          disabled={job?.status === "running"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      ) : job?.status === "failed" ? (
                        <>
                          <Button
                            size="sm" variant="outline"
                            className="h-7 w-7 p-0 text-orange-600 border-orange-200 hover:bg-orange-50"
                            data-testid={`button-retry-job-${group.id}`}
                            disabled={queueMutation.isPending}
                            title="Retry with same mode and scope"
                            onClick={() => queueMutation.mutate({ group, scope: (job.currency_scope as CurrencyScope) || currencyScope, mode: ((job as any).job_mode as JobMode) || "normal" })}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="text-xs h-7 px-2 text-slate-500"
                            data-testid={`button-open-chat-${group.id}`}
                            title={`Open in agent chat (${SCOPE_LABELS[currencyScope]})`}
                            onClick={() => {
                              const prompt = buildCBSetupPrompt(group, entityCount, bicCount, serviceCount, currencyScope);
                              setLocation(`/agent?prompt=${encodeURIComponent(prompt)}&conv=${encodeURIComponent(`CB Setup: ${group.group_name}`)}`);
                            }}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm" variant="outline"
                            className="h-7 w-7 p-0 text-amber-600 border-amber-200 hover:bg-amber-50"
                            data-testid={`button-queue-light-${group.id}`}
                            disabled={queueMutation.isPending}
                            title="Light setup: gpt-4o-mini · no web search · ~$0.01"
                            onClick={() => queueMutation.mutate({ group, scope: "home_only", mode: "light" })}
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="h-7 w-7 p-0 text-blue-600 border-blue-200 hover:bg-blue-50"
                            data-testid={`button-queue-job-${group.id}`}
                            disabled={queueMutation.isPending}
                            title={`Normal setup: gpt-4o · web search · ${SCOPE_LABELS[currencyScope]}`}
                            onClick={() => queueMutation.mutate({ group, scope: currencyScope, mode: "normal" })}
                          >
                            <Bot className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="text-xs h-7 px-2 text-slate-500"
                            data-testid={`button-open-chat-${group.id}`}
                            title={`Open in agent chat (${SCOPE_LABELS[currencyScope]})`}
                            onClick={() => {
                              const prompt = buildCBSetupPrompt(group, entityCount, bicCount, serviceCount, currencyScope);
                              setLocation(`/agent?prompt=${encodeURIComponent(prompt)}&conv=${encodeURIComponent(`CB Setup: ${group.group_name}`)}`);
                            }}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      {job?.status === "completed" && job.conversation_id && (
                        <Button
                          size="sm" variant="ghost"
                          className="text-xs h-7 px-2 text-emerald-600"
                          data-testid={`button-view-result-${group.id}`}
                          title="View agent output"
                          onClick={() => setLocation(`/agent`)}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">No groups match your filter.</div>
        )}
      </div>
    </div>
  );
}
