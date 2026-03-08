import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Search, ShieldCheck, Globe, Radio, TrendingUp, Bot } from "lucide-react";
import type { BankingGroup, LegalEntity, Bic, CorrespondentService, Fmi } from "@shared/schema";

const CURRENCIES = ["all","EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","NZD","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR","KRW","ILS"];
const SERVICE_TYPES = ["all","Correspondent Banking","Global Currency Clearing","Currency Clearing","RTGS Participation","Instant Payments Access","FX Liquidity","CLS Settlement","Custody Services","Transaction Banking","Liquidity Services"];

export default function Providers() {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [filterServiceType, setFilterServiceType] = useState("all");
  const [filterGsib, setFilterGsib] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedEntities, setExpandedEntities] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("search");
    if (s) setSearch(s);
  }, []);

  const { data: groups = [], isLoading: lg } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: entities = [], isLoading: le } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: bics = [], isLoading: lb } = useQuery<Bic[]>({ queryKey: ["/api/bics"] });
  const { data: services = [], isLoading: ls } = useQuery<CorrespondentService[]>({ queryKey: ["/api/correspondent-services"] });
  const { data: fmis = [], isLoading: lf } = useQuery<Fmi[]>({ queryKey: ["/api/fmis"] });

  const loading = lg || le || lb || ls || lf;

  const toggleGroup = (id: string) => setExpandedGroups(p => ({ ...p, [id]: !p[id] }));
  const toggleEntity = (id: string) => setExpandedEntities(p => ({ ...p, [id]: !p[id] }));

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

  const groupMatchesFilters = (group: BankingGroup) => {
    if (filterGsib !== "all" && group.gsib_status !== filterGsib) return false;
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
      const aCount = getEntitiesForGroup(a.id).flatMap(e => getBicsForEntity(e.id)).flatMap(b => getServicesForBic(b.id)).length;
      const bCount = getEntitiesForGroup(b.id).flatMap(e => getBicsForEntity(e.id)).flatMap(b => getServicesForBic(b.id)).length;
      return bCount - aCount;
    }
    return 0;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Banking Groups</h1>
        <p className="text-slate-500 text-sm mt-1">Browse banking groups, entities, BICs and correspondent services</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input data-testid="input-search-providers" placeholder="Search bank, BIC, country..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterCurrency} onValueChange={setFilterCurrency}>
          <SelectTrigger className="w-32" data-testid="select-filter-currency"><SelectValue placeholder="Currency" /></SelectTrigger>
          <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c === "all" ? "All Currencies" : c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterServiceType} onValueChange={setFilterServiceType}>
          <SelectTrigger className="w-48" data-testid="select-filter-service-type"><SelectValue placeholder="Service Type" /></SelectTrigger>
          <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s === "all" ? "All Service Types" : s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterGsib} onValueChange={setFilterGsib}>
          <SelectTrigger className="w-36" data-testid="select-filter-gsib"><SelectValue placeholder="SIB Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Banks</SelectItem>
            <SelectItem value="G-SIB">G-SIB</SelectItem>
            <SelectItem value="D-SIB">D-SIB</SelectItem>
            <SelectItem value="N/A">N/A</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40" data-testid="select-sort-by"><SelectValue placeholder="Sort By" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="country">Country (A-Z)</SelectItem>
            <SelectItem value="services">Services (Most)</SelectItem>
          </SelectContent>
        </Select>
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
            const totalServices = groupEntities.flatMap(e => getBicsForEntity(e.id)).flatMap(b => getServicesForBic(b.id)).length;
            const currencies = [...new Set(groupEntities.flatMap(e => getBicsForEntity(e.id)).flatMap(b => getServicesForBic(b.id)).map(s => s.currency).filter(Boolean))];

            return (
              <Card key={group.id} className="border-0 shadow-sm overflow-hidden" data-testid={`card-group-${group.id}`}>
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleGroup(group.id)}>
                  {expandedGroups[group.id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{group.group_name}</span>
                      {group.gsib_status === "G-SIB" && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs"><ShieldCheck className="w-3 h-3 mr-1" />G-SIB</Badge>}
                      {group.gsib_status === "D-SIB" && <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs"><ShieldCheck className="w-3 h-3 mr-1" />D-SIB</Badge>}
                      {groupHasClsMember(group.id) && <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-xs"><Globe className="w-3 h-3 mr-1" />CLS Member</Badge>}
                      {group.rtgs_member && group.rtgs_system && <Badge className="bg-green-100 text-green-700 border-green-200 text-xs"><Radio className="w-3 h-3 mr-1" />{group.rtgs_system}</Badge>}
                      {group.cb_probability === "High" && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs"><TrendingUp className="w-3 h-3 mr-1" />CB: High</Badge>}
                      {group.cb_probability === "Medium" && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs"><TrendingUp className="w-3 h-3 mr-1" />CB: Medium</Badge>}
                      {group.cb_probability === "Low" && <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs"><TrendingUp className="w-3 h-3 mr-1" />CB: Low</Badge>}
                      {group.headquarters_country && <Badge variant="outline" className="text-xs">{group.headquarters_country}</Badge>}
                      {group.primary_currency && <Badge variant="outline" className="text-xs font-mono">{group.primary_currency}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {currencies.slice(0, 10).map(c => <span key={c} className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">{c}</span>)}
                      {currencies.length > 10 && <span className="text-xs text-slate-400">+{currencies.length - 10}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-slate-500">
                      <div>{groupEntities.length} entit{groupEntities.length !== 1 ? "ies" : "y"}</div>
                      <div>{totalServices} service{totalServices !== 1 ? "s" : ""}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2 text-blue-600 border-blue-200 hover:bg-blue-50 shrink-0"
                      data-testid={`button-cb-setup-${group.id}`}
                      onClick={e => {
                        e.stopPropagation();
                        const totalBics = groupEntities.flatMap(en => getBicsForEntity(en.id)).length;
                        const CLS_CCY = new Set(["AUD","CAD","CHF","DKK","EUR","GBP","HKD","JPY","MXN","NOK","NZD","SEK","SGD","USD","ILS","ZAR","KRW","HUF"]);
                        const rtgsLabel = group.rtgs_system || (group.primary_currency ? `identify RTGS for ${group.primary_currency}` : "not identified");
                        const clsLine = group.primary_currency && CLS_CCY.has(group.primary_currency)
                          ? `CLS (fmi_type "FX Settlement Systems") — ${group.primary_currency} is a CLS-eligible currency; check direct settlement membership`
                          : `CLS — verify whether ${group.primary_currency || "the home currency"} participates in CLS`;
                        const prompt = `Run the CB Entity Setup workflow for ${group.group_name}${group.headquarters_country ? ` (${group.headquarters_country})` : ""} [Scope: all currencies]
Group ID: ${group.id} | Home currency: ${group.primary_currency || "not set"} | RTGS: ${rtgsLabel} | CB probability: ${group.cb_probability || "not set"}
Current DB state: ${groupEntities.length} legal entit${groupEntities.length !== 1 ? "ies" : "y"}, ${totalBics} BIC${totalBics !== 1 ? "s" : ""}, ${totalServices} service${totalServices !== 1 ? "s" : ""} recorded.

---
STEP 1 — VERIFY BANKING GROUP RECORD
Locate this group using list_banking_groups (ID: ${group.id}).
If any of the following fields are missing, research and fill them now using update_banking_group before proceeding:
• primary_currency  • rtgs_system  • rtgs_member (boolean)  • cb_probability (High/Medium/Low/Unconfirmed)  • cb_evidence (one-sentence summary)

---
STEP 2 — IDENTIFY CORRESPONDENT BANKING LEGAL ENTITIES
Search: "${group.group_name} correspondent banking SWIFT BIC legal entity".
Target ONLY: (a) the primary HQ licensed banking entity, (b) dedicated CB-hub subsidiaries that directly operate CB business for external financial institutions.
Do NOT add every subsidiary — be selective; prefer fewer high-confidence entities over many speculative ones.
For each candidate: call find_legal_entity_by_name to check if it already exists.
• Exists → note its ID; update any missing fields (country, entity_type, notes) using update_legal_entity.
• Does not exist → create with create_legal_entity linked to group_id ${group.id}.

---
STEP 3 — BIC CODES
For every entity identified in Step 2: call list_bics to check if a BIC is already linked to it.
• BIC exists → use its ID; update any missing fields using update_bic.
• Missing → add with create_bic. Set is_headquarters=true and swift_member=true for the primary HQ entity's BIC.

---
STEP 4 — CORRESPONDENT SERVICES
For each BIC, identify and add all currencies that entity is known to offer Correspondent Banking services in. Include the home currency${group.primary_currency ? ` (${group.primary_currency})` : ""} plus any additional currencies confirmed through research.
Before creating any service: call list_correspondent_services and confirm no existing record exists for that BIC + currency combination.
• Exists → update with any missing details using update_correspondent_service; do NOT create a duplicate.
• Missing → create with create_correspondent_service. bic_id must be a real UUID obtained from list_bics.
For clearing_model: Onshore ONLY if the BIC entity's country is the home country/region of that currency's settlement infrastructure (e.g. EUR for a Eurozone entity, USD for a US entity, GBP for a UK entity). All other currencies offered by that entity are Offshore.

---
STEP 5 — FMI MEMBERSHIPS
For the primary HQ entity, proactively check and record the following (call check_fmi_membership before each create_fmi):
• SWIFT (fmi_type "Messaging Networks") — virtually all major international banks are SWIFT members; confirm and record
• ${rtgsLabel} (fmi_type "Payment Systems") — check whether this entity is a direct participant; search "${group.group_name} ${rtgsLabel} direct participant" to confirm
• ${clsLine}
• Any additional FMIs discovered during research (Euroclear, Clearstream, Fedwire, CHAPS, CHIPS, LCH, etc.)

---
Work all 5 steps fully. End with a summary: entities added/updated | BICs added | services created | FMI memberships recorded | any issues.`;
                        setLocation(`/agent?prompt=${encodeURIComponent(prompt)}&conv=${encodeURIComponent(`CB Setup: ${group.group_name}`)}`);
                      }}
                    >
                      <Bot className="w-3 h-3 mr-1" />CB Setup
                    </Button>
                  </div>
                </div>

                {expandedGroups[group.id] && (
                  <div className="border-t border-slate-100">
                    {(group.rtgs_system || group.cb_probability || group.cb_evidence) && (
                      <div className="px-8 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-4 text-xs text-slate-600">
                        {group.rtgs_system && <span><span className="font-medium text-slate-500">RTGS:</span> {group.rtgs_system} {group.rtgs_member ? "✅ Member" : "⚠️ Unconfirmed"}</span>}
                        {group.cb_probability && <span><span className="font-medium text-slate-500">CB Probability:</span> {group.cb_probability}</span>}
                        {group.cb_evidence && <span className="flex-1 text-slate-500 italic">{group.cb_evidence}</span>}
                      </div>
                    )}
                    {groupEntities.length === 0 ? (
                      <div className="px-8 py-4 text-slate-400 text-sm">No legal entities for this group.</div>
                    ) : (
                      groupEntities.map(entity => {
                        const entityBics = getBicsForEntity(entity.id);
                        return (
                          <div key={entity.id} className="border-b border-slate-50 last:border-0">
                            <div className="flex items-center gap-3 px-8 py-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleEntity(entity.id)}>
                              {expandedEntities[entity.id] ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-slate-800">{entity.legal_name}</span>
                                  {isEntityClsMember(entity.id) && <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-xs"><Globe className="w-3 h-3 mr-1" />CLS Member</Badge>}
                                </div>
                                <span className="text-xs text-slate-500">{entity.country}</span>
                                {entity.entity_type && <Badge variant="outline" className="ml-2 text-xs">{entity.entity_type}</Badge>}
                              </div>
                              <span className="text-xs text-slate-400">{entityBics.length} BIC{entityBics.length !== 1 ? "s" : ""}</span>
                            </div>

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
                                                      {svc.clearing_model ? (
                                                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${svc.clearing_model === "Onshore" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{svc.clearing_model}</span>
                                                      ) : "—"}
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
    </div>
  );
}
