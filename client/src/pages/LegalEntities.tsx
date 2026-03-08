import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Search, ShieldCheck, Globe, Building2, Swords, PlusCircle, Trash2, User, BotIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BankingGroup, LegalEntity, Bic, CorrespondentService, Fmi, IntelObservation } from "@shared/schema";

const CURRENCIES = ["all","EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR"];
const SERVICE_TYPES = ["all","Correspondent Banking","Currency Clearing","RTGS Participation","Instant Payments Access","FX Liquidity","CLS Settlement","Custody Services","Transaction Banking","Liquidity Services"];
const CB_CURRENCIES = ["EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","NZD","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR","KRW","ILS"];

type IntelDialog =
  | { entityId: string; entityName: string; groupId: string; groupName: string }
  | null;

export default function LegalEntities() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [filterServiceType, setFilterServiceType] = useState("all");
  const [filterGsib, setFilterGsib] = useState("all");
  const [filterIntel, setFilterIntel] = useState<"all" | "competitor" | "cb_provider">("all");
  const [expandedEntities, setExpandedEntities] = useState<Record<string, boolean>>({});

  // Intel dialog state
  const [intelDialog, setIntelDialog] = useState<IntelDialog>(null);
  const [intelCurrency, setIntelCurrency] = useState("");
  const [intelNotes, setIntelNotes] = useState("");

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
  const { data: intel = [] } = useQuery<IntelObservation[]>({ queryKey: ["/api/intel"] });

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
  const getEntityIntel = (entityId: string) => intel.filter(o => o.legal_entity_id === entityId);
  const getGroupIntel = (groupId: string) => intel.filter(o => o.banking_group_id === groupId && !o.legal_entity_id);

  // Intel mutations
  const addIntelMutation = useMutation({
    mutationFn: (vars: { banking_group_id: string; banking_group_name: string; legal_entity_id: string; legal_entity_name: string; obs_type: "cb_provider"; currency: string; notes?: string }) =>
      apiRequest("POST", "/api/intel", vars).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel"] });
      setIntelDialog(null);
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

  const openEntityIntelDialog = (entity: LegalEntity, e: React.MouseEvent) => {
    e.stopPropagation();
    const group = getGroupForEntity(entity.group_id);
    setIntelCurrency("");
    setIntelNotes("");
    setIntelDialog({
      entityId: entity.id,
      entityName: entity.legal_name,
      groupId: entity.group_id,
      groupName: group?.group_name || entity.group_name || "",
    });
  };

  const submitIntel = () => {
    if (!intelDialog) return;
    if (!intelCurrency) {
      toast({ title: "Currency required", description: "Please select a currency for CB Provider.", variant: "destructive" });
      return;
    }
    addIntelMutation.mutate({
      banking_group_id: intelDialog.groupId,
      banking_group_name: intelDialog.groupName,
      legal_entity_id: intelDialog.entityId,
      legal_entity_name: intelDialog.entityName,
      obs_type: "cb_provider",
      currency: intelCurrency,
      notes: intelNotes || undefined,
    });
  };

  const entityMatchesFilters = (entity: LegalEntity) => {
    const group = getGroupForEntity(entity.group_id);
    if (filterGsib === "gsib" && group?.gsib_status !== "G-SIB") return false;
    if (filterGsib === "nongsib" && group?.gsib_status === "G-SIB") return false;
    if (filterIntel === "competitor") {
      if (!getGroupIntel(entity.group_id).some(o => o.obs_type === "competitor")) return false;
    }
    if (filterIntel === "cb_provider") {
      if (!getEntityIntel(entity.id).some(o => o.obs_type === "cb_provider")) return false;
    }
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

      <div className="flex flex-wrap gap-3 items-center">
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

        {/* Intel filter */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm" data-testid="intel-filter-entities">
          <button
            data-testid="intel-filter-entities-all"
            onClick={() => setFilterIntel("all")}
            className={`px-3 py-1.5 border-r border-slate-200 transition-colors ${filterIntel === "all" ? "bg-slate-700 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            All
          </button>
          <button
            data-testid="intel-filter-entities-competitor"
            onClick={() => setFilterIntel(filterIntel === "competitor" ? "all" : "competitor")}
            className={`flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 transition-colors ${filterIntel === "competitor" ? "bg-orange-500 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            <Swords className="w-3 h-3" /> Competitor
          </button>
          <button
            data-testid="intel-filter-entities-cb-provider"
            onClick={() => setFilterIntel(filterIntel === "cb_provider" ? "all" : "cb_provider")}
            className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${filterIntel === "cb_provider" ? "bg-violet-600 text-white font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            <Building2 className="w-3 h-3" /> CB Provider
          </button>
        </div>
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
            const entityIntel = getEntityIntel(entity.id);
            const groupIsCompetitor = getGroupIntel(entity.group_id).some(o => o.obs_type === "competitor");
            const cbCurrencies = [...new Set(entityIntel.filter(o => o.obs_type === "cb_provider" && o.currency).map(o => o.currency))];

            return (
              <Card key={entity.id} className="border-0 shadow-sm overflow-hidden" data-testid={`card-entity-${entity.id}`}>
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleEntity(entity.id)}>
                  {expandedEntities[entity.id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{entity.legal_name}</span>
                      {group?.gsib_status === "G-SIB" && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs"><ShieldCheck className="w-3 h-3 mr-1" />G-SIB</Badge>}
                      {entity.country && <Badge variant="outline" className="text-xs">{entity.country}</Badge>}
                      {entity.entity_type && <Badge variant="outline" className="text-xs">{entity.entity_type}</Badge>}
                      {fmis.filter(f => f.legal_entity_id === entity.id).map(f => (
                        <Badge key={f.id} className="bg-teal-100 text-teal-700 border-teal-200 text-xs"><Globe className="w-3 h-3 mr-1" />{f.fmi_name || f.fmi_type}</Badge>
                      ))}
                      {groupIsCompetitor && (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs" title="Parent group tagged as competitor">
                          <Swords className="w-3 h-3 mr-1" />Competitor
                        </Badge>
                      )}
                      {cbCurrencies.map(ccy => (
                        <Badge key={ccy} className="bg-violet-100 text-violet-700 border-violet-200 text-xs"><Building2 className="w-2.5 h-2.5 mr-1" />CB: {ccy}</Badge>
                      ))}
                      {entity.group_name && <span className="text-xs text-slate-400">· {entity.group_name}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {currencies.slice(0, 10).map(c => <span key={c} className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">{c}</span>)}
                      {currencies.length > 10 && <span className="text-xs text-slate-400">+{currencies.length - 10}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right text-xs text-slate-500">
                      <div>{entityBics.length} BIC{entityBics.length !== 1 ? "s" : ""}</div>
                      <div>{totalServices} service{totalServices !== 1 ? "s" : ""}</div>
                    </div>
                    <button
                      data-testid={`button-entity-intel-${entity.id}`}
                      title="Add CB Provider intel for this entity"
                      onClick={e => openEntityIntelDialog(entity, e)}
                      className="text-violet-300 hover:text-violet-600 transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Entity intel list */}
                {entityIntel.length > 0 && (
                  <div className="px-10 pb-2 pt-0 bg-violet-50/40 border-t border-violet-100 space-y-1.5">
                    <div className="text-xs font-medium text-violet-700 pt-2 mb-1">Intel</div>
                    {entityIntel.map(obs => (
                      <div key={obs.id} className="flex items-center gap-2 text-xs">
                        <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs shrink-0">
                          <Building2 className="w-2.5 h-2.5 mr-1" />CB: {obs.currency}
                        </Badge>
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

      {/* Add CB Provider intel dialog */}
      <Dialog open={!!intelDialog} onOpenChange={open => { if (!open) setIntelDialog(null); }}>
        <DialogContent className="max-w-sm" data-testid="entity-intel-dialog">
          <DialogHeader>
            <DialogTitle>Add CB Provider Intel</DialogTitle>
          </DialogHeader>
          {intelDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-500">
                For <span className="font-medium text-slate-800">{intelDialog.entityName}</span>
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Currency <span className="text-red-500">*</span></label>
                <Select value={intelCurrency} onValueChange={setIntelCurrency}>
                  <SelectTrigger data-testid="entity-intel-currency-select">
                    <SelectValue placeholder="Select currency…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CB_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <Textarea
                  data-testid="entity-intel-notes"
                  placeholder="e.g. confirmed EUR clearing via entity X"
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
              data-testid="confirm-entity-intel"
              disabled={addIntelMutation.isPending}
              onClick={submitIntel}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {addIntelMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saving…</> : "Save Intel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
