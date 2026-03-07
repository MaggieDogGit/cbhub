import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertCircle, XCircle, Bot, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { BankingGroup, LegalEntity, Bic, CorrespondentService } from "@shared/schema";

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

export default function Coverage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<CoverageStatus | "all">("all");

  const { data: groups = [], isLoading: lg } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: entities = [], isLoading: le } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: bics = [], isLoading: lb } = useQuery<Bic[]>({ queryKey: ["/api/bics"] });
  const { data: services = [], isLoading: ls } = useQuery<CorrespondentService[]>({ queryKey: ["/api/correspondent-services"] });

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
    };
  });

  const completeCount = enrichedGroups.filter(r => r.status === "complete").length;
  const partialCount = enrichedGroups.filter(r => r.status === "partial").length;
  const emptyCount = enrichedGroups.filter(r => r.status === "empty").length;

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

  const statusConfig: Record<CoverageStatus, { label: string; icon: React.ReactNode; badge: string }> = {
    complete: { label: "Complete", icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    partial:  { label: "Partial",  icon: <AlertCircle  className="w-4 h-4 text-amber-500"  />, badge: "bg-amber-100 text-amber-700 border-amber-200"   },
    empty:    { label: "Empty",    icon: <XCircle      className="w-4 h-4 text-red-400"    />, badge: "bg-red-100 text-red-700 border-red-200"          },
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64" data-testid="loading-coverage">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Data Coverage</h1>
        <p className="text-slate-500 text-sm mt-1">Track which banking groups have complete data chains: entity → BIC → correspondent service</p>
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
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ group, entityCount, bicCount, serviceCount, status }, i) => (
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 px-2 text-blue-600 border-blue-200 hover:bg-blue-50 whitespace-nowrap"
                    data-testid={`button-cb-setup-coverage-${group.id}`}
                    onClick={() => {
                      const prompt = buildCBSetupPrompt(group, entityCount, bicCount, serviceCount);
                      setLocation(`/agent?prompt=${encodeURIComponent(prompt)}&conv=${encodeURIComponent(`CB Setup: ${group.group_name}`)}`);
                    }}
                  >
                    <Bot className="w-3 h-3 mr-1" />CB Setup
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">No groups match your filter.</div>
        )}
      </div>
    </div>
  );
}
