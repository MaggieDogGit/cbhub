import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Search, ShieldCheck } from "lucide-react";
import type { BankingGroup, LegalEntity, Bic, CorrespondentService, Fmi } from "@shared/schema";

const CURRENCIES = ["all","EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR"];
const SERVICE_TYPES = ["all","Correspondent Banking","Currency Clearing","RTGS Participation","Instant Payments Access","FX Liquidity","CLS Settlement","Custody Services","Transaction Banking","Liquidity Services"];

export default function LegalEntities() {
  const [search, setSearch] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [filterServiceType, setFilterServiceType] = useState("all");
  const [filterGsib, setFilterGsib] = useState("all");
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

  const toggleEntity = (id: string) => setExpandedEntities(p => ({ ...p, [id]: !p[id] }));
  const getGroupForEntity = (groupId: string) => groups.find(g => g.id === groupId);
  const getBicsForEntity = (entityId: string) => bics.filter(b => b.legal_entity_id === entityId);
  const getServicesForBic = (bicId: string) => {
    let svcs = services.filter(s => s.bic_id === bicId);
    if (filterCurrency !== "all") svcs = svcs.filter(s => s.currency === filterCurrency);
    if (filterServiceType !== "all") svcs = svcs.filter(s => s.service_type === filterServiceType);
    return svcs;
  };

  const entityMatchesFilters = (entity: LegalEntity) => {
    const group = getGroupForEntity(entity.group_id);
    if (filterGsib === "gsib" && group?.gsib_status !== "G-SIB") return false;
    if (filterGsib === "nongsib" && group?.gsib_status === "G-SIB") return false;
    if (search) {
      const q = search.toLowerCase();
      const entityMatch = entity.legal_name?.toLowerCase().includes(q) || entity.country?.toLowerCase().includes(q);
      const groupMatch = entity.group_name?.toLowerCase().includes(q);
      const bicMatch = getBicsForEntity(entity.id).some(b => b.bic_code?.toLowerCase().includes(q) || b.city?.toLowerCase().includes(q));
      if (!entityMatch && !groupMatch && !bicMatch) return false;
    }
    if (filterCurrency !== "all" || filterServiceType !== "all") {
      if (!getBicsForEntity(entity.id).some(b => getServicesForBic(b.id).length > 0)) return false;
    }
    return true;
  };

  const filteredEntities = entities.filter(entityMatchesFilters);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">CB Legal Entities</h1>
        <p className="text-slate-500 text-sm mt-1">Browse legal entities, BICs and correspondent services</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input data-testid="input-search-entities" placeholder="Search entity, BIC, country..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterCurrency} onValueChange={setFilterCurrency}>
          <SelectTrigger className="w-32" data-testid="select-filter-currency"><SelectValue placeholder="Currency" /></SelectTrigger>
          <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c === "all" ? "All Currencies" : c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterServiceType} onValueChange={setFilterServiceType}>
          <SelectTrigger className="w-48" data-testid="select-filter-service"><SelectValue placeholder="Service Type" /></SelectTrigger>
          <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s === "all" ? "All Service Types" : s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterGsib} onValueChange={setFilterGsib}>
          <SelectTrigger className="w-36" data-testid="select-filter-gsib"><SelectValue placeholder="G-SIB" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Banks</SelectItem>
            <SelectItem value="gsib">G-SIB Only</SelectItem>
            <SelectItem value="nongsib">Non G-SIB</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-slate-500">{filteredEntities.length} legal entit{filteredEntities.length !== 1 ? "ies" : "y"}</div>

      {filteredEntities.length === 0 ? (
        <Card className="border-0 shadow-sm"><CardContent className="p-8 text-center text-slate-400 text-sm">No legal entities found.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filteredEntities.map(entity => {
            const group = getGroupForEntity(entity.group_id);
            const entityBics = getBicsForEntity(entity.id);
            const totalServices = entityBics.flatMap(b => getServicesForBic(b.id)).length;
            const currencies = [...new Set(entityBics.flatMap(b => getServicesForBic(b.id)).map(s => s.currency).filter(Boolean))];

            return (
              <Card key={entity.id} className="border-0 shadow-sm overflow-hidden" data-testid={`card-entity-${entity.id}`}>
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleEntity(entity.id)}>
                  {expandedEntities[entity.id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{entity.legal_name}</span>
                      {group?.gsib_status === "G-SIB" && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs"><ShieldCheck className="w-3 h-3 mr-1" />G-SIB</Badge>}
                      {entity.country && <Badge variant="outline" className="text-xs">{entity.country}</Badge>}
                      {entity.entity_type && <Badge variant="outline" className="text-xs">{entity.entity_type}</Badge>}
                      {fmis.filter(f => f.legal_entity_id === entity.id).map(f => (
                        <Badge key={f.id} className="bg-teal-100 text-teal-700 border-teal-200 text-xs">{f.fmi_name || f.fmi_type}</Badge>
                      ))}
                      {entity.group_name && <span className="text-xs text-slate-400">· {entity.group_name}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {currencies.slice(0, 10).map(c => <span key={c} className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">{c}</span>)}
                      {currencies.length > 10 && <span className="text-xs text-slate-400">+{currencies.length - 10}</span>}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>{entityBics.length} BIC{entityBics.length !== 1 ? "s" : ""}</div>
                    <div>{totalServices} service{totalServices !== 1 ? "s" : ""}</div>
                  </div>
                </div>

                {expandedEntities[entity.id] && (
                  <div className="border-t border-slate-100 px-8 pb-4 pt-2">
                    {entityBics.length === 0 ? <p className="text-slate-400 text-sm">No BICs registered.</p> : (
                      entityBics.map(bic => {
                        const bicServices = getServicesForBic(bic.id);
                        return (
                          <div key={bic.id} className="mb-3 bg-slate-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-mono font-bold text-slate-800">{bic.bic_code}</span>
                              <span className="text-xs text-slate-500">{bic.city}{bic.city && bic.country ? ", " : ""}{bic.country}</span>
                              {bic.is_headquarters && <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">HQ</Badge>}
                            </div>
                            {bicServices.length === 0 ? <p className="text-slate-400 text-xs">No services recorded.</p> : (
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
                                          {svc.clearing_model ? <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${svc.clearing_model === "Onshore" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{svc.clearing_model}</span> : "—"}
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
