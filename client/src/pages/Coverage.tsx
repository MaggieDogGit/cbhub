import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertCircle, XCircle, Bot, Search, ShieldCheck, Clock, Loader2, ExternalLink, Trash2, Play } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { BankingGroup, LegalEntity, Bic, CorrespondentService, AgentJob } from "@shared/schema";

type CoverageStatus = "complete" | "partial" | "empty";

function buildCBSetupPrompt(group: BankingGroup, entityCount: number, bicCount: number, serviceCount: number): string {
  return `Run the CB Entity Setup workflow for ${group.group_name}${group.headquarters_country ? ` (${group.headquarters_country})` : ""}:

1. Search the web to identify which legal entities within ${group.group_name} actively provide Correspondent Banking services to other financial institutions. For each entity found, check if it already exists in the database before creating it.

2. For each identified CB legal entity, find their primary BIC/SWIFT code. Add it using create_bic if not already present (check list_bics first).

3. For each BIC, ensure a Correspondent Banking service exists in the home currency${group.primary_currency ? ` (${group.primary_currency})` : ""}. Also identify and add any other currencies that entity is known to offer CB services in.

4. If any FMI memberships are discovered (e.g. SWIFT, TARGET2, CLS, Euroclear), record them using create_fmi with the correct fmi_type category and fmi_name.

Current database state for this group: ${entityCount} legal entit${entityCount !== 1 ? "ies" : "y"}, ${bicCount} BIC${bicCount !== 1 ? "s" : ""}, ${serviceCount} service${serviceCount !== 1 ? "s" : ""} recorded. CB probability: ${group.cb_probability || "not set"}. Home currency: ${group.primary_currency || "not set"}.

Check for duplicates before creating any record. Work through each step fully before moving to the next.`;
}

const statusConfig: Record<CoverageStatus, { label: string; icon: React.ReactNode; badge: string }> = {
  complete: { label: "Complete", icon: <CheckCircle2 className="w-3.5 h-3.5" />, badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  partial:  { label: "Partial",  icon: <AlertCircle  className="w-3.5 h-3.5" />, badge: "bg-amber-100 text-amber-700 border-amber-200"   },
  empty:    { label: "Empty",    icon: <XCircle      className="w-3.5 h-3.5" />, badge: "bg-red-100 text-red-700 border-red-200"          },
};

function JobStatusBadge({ job }: { job: AgentJob }) {
  if (job.status === "pending") return (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs gap-1">
      <Clock className="w-3 h-3" /> Queued
    </Badge>
  );
  if (job.status === "running") return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs gap-1">
      <Loader2 className="w-3 h-3 animate-spin" /> Running {job.steps_completed ? `(${job.steps_completed} steps)` : ""}
    </Badge>
  );
  if (job.status === "completed") return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1">
      <CheckCircle2 className="w-3 h-3" /> Done ({job.steps_completed} steps)
    </Badge>
  );
  if (job.status === "failed") return (
    <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1" title={job.error_message || ""}>
      <XCircle className="w-3 h-3" /> Failed
    </Badge>
  );
  return null;
}

export default function Coverage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<CoverageStatus | "all">("all");
  const { toast } = useToast();

  const { data: groups = [], isLoading: lg } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: entities = [], isLoading: le } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: bics = [], isLoading: lb } = useQuery<Bic[]>({ queryKey: ["/api/bics"] });
  const { data: services = [], isLoading: ls } = useQuery<CorrespondentService[]>({ queryKey: ["/api/correspondent-services"] });
  const { data: jobs = [] } = useQuery<AgentJob[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: (query) => {
      const data = query.state.data as AgentJob[] | undefined;
      const hasActive = data?.some(j => j.status === "pending" || j.status === "running");
      return hasActive ? 5000 : 15000;
    },
  });

  const queueMutation = useMutation({
    mutationFn: (group: BankingGroup) =>
      apiRequest("POST", "/api/jobs", { banking_group_id: group.id, banking_group_name: group.group_name }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Job queued", description: "The CB Setup workflow will run in the background." });
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
    mutationFn: (groupIds: { id: string; name: string }[]) =>
      apiRequest("POST", "/api/jobs/queue-all", { group_ids: groupIds }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: `${data.queued} jobs queued`, description: "The background runner will process them one at a time." });
    },
    onError: (err: any) => toast({ title: "Queue all failed", description: err.message, variant: "destructive" }),
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
  const partialCount = enrichedGroups.filter(r => r.status === "partial").length;
  const emptyCount = enrichedGroups.filter(r => r.status === "empty").length;
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

  const emptyGroups = enrichedGroups.filter(r => r.status === "empty").map(r => ({ id: r.group.id, name: r.group.group_name }));
  const incompleteGroups = enrichedGroups.filter(r => r.status !== "complete").map(r => ({ id: r.group.id, name: r.group.group_name }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Coverage</h1>
          <p className="text-slate-500 text-sm mt-1">Track which banking groups have complete data chains: entity → BIC → service</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeJobCount > 0 && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1 self-center">
              <Loader2 className="w-3 h-3 animate-spin" /> {activeJobCount} job{activeJobCount !== 1 ? "s" : ""} running
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
            data-testid="button-queue-all-empty"
            disabled={queueAllMutation.isPending || emptyGroups.length === 0}
            onClick={() => queueAllMutation.mutate(emptyGroups)}
          >
            <Play className="w-3.5 h-3.5 mr-1" />
            Queue Empty ({emptyGroups.length})
          </Button>
          <Button
            size="sm"
            className="text-xs bg-blue-600 hover:bg-blue-700"
            data-testid="button-queue-all-incomplete"
            disabled={queueAllMutation.isPending || incompleteGroups.length === 0}
            onClick={() => queueAllMutation.mutate(incompleteGroups)}
          >
            <Bot className="w-3.5 h-3.5 mr-1" />
            Queue All Incomplete ({incompleteGroups.length})
          </Button>
        </div>
      </div>

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

      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-600">Banking Group</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">Country</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Currency</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600">Entities</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600">BICs</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600">Services</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Coverage</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Job Status</th>
              <th className="px-4 py-3"></th>
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
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{group.headquarters_country || "—"}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {group.primary_currency
                      ? <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{group.primary_currency}</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-medium ${entityCount > 0 ? "text-slate-900" : "text-slate-400"}`}>{entityCount}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-medium ${bicCount > 0 ? "text-slate-900" : "text-slate-400"}`}>{bicCount}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-medium ${serviceCount > 0 ? "text-slate-900" : "text-slate-400"}`}>{serviceCount}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`${statusConfig[status].badge} text-xs gap-1`} data-testid={`status-${group.id}`}>
                      {statusConfig[status].icon}
                      {statusConfig[status].label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {job ? <JobStatusBadge job={job} /> : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {isActive ? (
                        <Button
                          size="sm" variant="outline"
                          className="text-xs h-7 px-2 text-red-500 border-red-200 hover:bg-red-50"
                          data-testid={`button-cancel-job-${group.id}`}
                          onClick={() => job && cancelMutation.mutate(job.id)}
                          disabled={job?.status === "running"}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />Cancel
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm" variant="outline"
                            className="text-xs h-7 px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                            data-testid={`button-queue-job-${group.id}`}
                            disabled={queueMutation.isPending}
                            onClick={() => queueMutation.mutate(group)}
                          >
                            <Bot className="w-3 h-3 mr-1" />Queue
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="text-xs h-7 px-2 text-slate-500"
                            data-testid={`button-open-chat-${group.id}`}
                            title="Open in agent chat"
                            onClick={() => {
                              const prompt = buildCBSetupPrompt(group, entityCount, bicCount, serviceCount);
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
