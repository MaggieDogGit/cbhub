import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  BankingGroup, LegalEntity, Bic, CorrespondentService, Fmi, IntelObservation,
} from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Plus, Pencil, Trash2, ChevronRight, ChevronDown, SlidersHorizontal,
  Building2, Swords, X, ArrowLeft, Check, Landmark, Globe, CreditCard, Shield,
} from "lucide-react";

const CURRENCIES = ["all","USD","EUR","GBP","AED","AUD","BGN","BHD","BRL","CAD","CHF","CLP","CNH","CNY","COP","CZK","DKK","EGP","HKD","HUF","IDR","ILS","INR","JPY","KES","KRW","KWD","MAD","MXN","MYR","NGN","NOK","NZD","OMR","PEN","PHP","PLN","QAR","RON","SAR","SEK","SGD","THB","TRY","TWD","ZAR"];
const CB_CURRENCIES = CURRENCIES.filter(c => c !== "all");
const SERVICE_TYPES = ["all","Correspondent Banking","Global Currency Clearing","Currency Clearing","RTGS Participation","Instant Payments Access","FX Liquidity","CLS Settlement","Custody Services","Transaction Banking","Liquidity Services"];
const ENTITY_TYPES = ["Bank", "Branch", "Subsidiary", "Representative Office", "Other"];
const GSIB_OPTIONS = ["G-SIB", "D-SIB", "N/A"];
const CB_PROBS = ["High", "Medium", "Low", "Unconfirmed"];
const CLEARING_MODELS = ["Onshore", "Offshore"];
const FMI_TYPES = ["Payment Systems","Instant Payment Systems","Securities Settlement Systems","Central Securities Depositories","Central Counterparties","Trade Repositories","FX Settlement Systems","Messaging Networks"];

type EditLevel = "group" | "entity" | "bic" | "service" | "fmi";
type DrawerState = {
  open: boolean;
  mode: "create" | "edit";
  level: EditLevel;
  data: Record<string, any>;
  parentIds: Record<string, string>;
  step: "form" | "review";
};

const emptyDrawer: DrawerState = { open: false, mode: "create", level: "group", data: {}, parentIds: {}, step: "form" };

type DeleteTarget = { id: string; level: EditLevel; label: string } | null;

export default function Registry() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [filterServiceType, setFilterServiceType] = useState("all");
  const [filterGsib, setFilterGsib] = useState("all");
  const [filterIntel, setFilterIntel] = useState<"all" | "competitor" | "cb_provider">("all");
  const [showFilters, setShowFilters] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const [expandedBics, setExpandedBics] = useState<Set<string>>(new Set());
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);

  const [drawer, setDrawer] = useState<DrawerState>(emptyDrawer);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const { data: groups = [] } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: entities = [] } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: allBics = [] } = useQuery<Bic[]>({ queryKey: ["/api/bics"] });
  const { data: services = [] } = useQuery<CorrespondentService[]>({ queryKey: ["/api/correspondent-services"] });
  const { data: allFmis = [] } = useQuery<Fmi[]>({ queryKey: ["/api/fmis"] });
  const { data: intel = [] } = useQuery<IntelObservation[]>({ queryKey: ["/api/intel"] });

  const filteredGroups = useMemo(() => {
    let result = [...groups];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(g => {
        if (g.group_name.toLowerCase().includes(q)) return true;
        if (g.headquarters_country?.toLowerCase().includes(q)) return true;
        const grpEntities = entities.filter(e => e.group_id === g.id);
        if (grpEntities.some(e => e.legal_name.toLowerCase().includes(q))) return true;
        const grpBics = allBics.filter(b => grpEntities.some(e => e.id === b.legal_entity_id));
        if (grpBics.some(b => b.bic_code.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    if (filterGsib !== "all") result = result.filter(g => g.gsib_status === filterGsib);
    if (filterIntel !== "all") {
      result = result.filter(g => intel.some(o => o.banking_group_id === g.id && o.obs_type === filterIntel));
    }
    if (filterCurrency !== "all" || filterServiceType !== "all") {
      result = result.filter(g => {
        const grpEntities = entities.filter(e => e.group_id === g.id);
        const grpBics = allBics.filter(b => grpEntities.some(e => e.id === b.legal_entity_id));
        const grpServices = services.filter(s => grpBics.some(b => b.id === s.bic_id));
        if (filterCurrency !== "all" && !grpServices.some(s => s.currency === filterCurrency)) return false;
        if (filterServiceType !== "all" && !grpServices.some(s => s.service_type === filterServiceType)) return false;
        return true;
      });
    }
    return result.sort((a, b) => a.group_name.localeCompare(b.group_name));
  }, [groups, entities, allBics, services, intel, search, filterCurrency, filterServiceType, filterGsib, filterIntel]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId) || null;
  const groupEntities = useMemo(() => entities.filter(e => e.group_id === selectedGroupId).sort((a, b) => a.legal_name.localeCompare(b.legal_name)), [entities, selectedGroupId]);

  const getBicsForEntity = (eid: string) => allBics.filter(b => b.legal_entity_id === eid);
  const getServicesForBic = (bid: string) => services.filter(s => s.bic_id === bid);
  const getFmisForEntity = (eid: string) => allFmis.filter(f => f.legal_entity_id === eid);

  const toggleEntity = (id: string) => setExpandedEntities(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleBic = (id: string) => setExpandedBics(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function selectGroup(id: string) {
    setSelectedGroupId(id);
    setExpandedEntities(new Set());
    setExpandedBics(new Set());
    setMobileEditorOpen(true);
  }

  function openDrawer(mode: "create" | "edit", level: EditLevel, data: Record<string, any> = {}, parentIds: Record<string, string> = {}) {
    setDrawer({ open: true, mode, level, data: { ...data }, parentIds, step: "form" });
  }

  function closeDrawer() {
    setDrawer(emptyDrawer);
  }

  const apiUrl: Record<EditLevel, string> = { group: "/api/banking-groups", entity: "/api/legal-entities", bic: "/api/bics", service: "/api/correspondent-services", fmi: "/api/fmis" };
  const queryKeys: string[] = ["/api/banking-groups", "/api/legal-entities", "/api/bics", "/api/correspondent-services", "/api/fmis"];

  const saveMutation = useMutation({
    mutationFn: async ({ level, mode, data, id }: { level: EditLevel; mode: "create" | "edit"; data: Record<string, any>; id?: string }) => {
      if (mode === "create") {
        return apiRequest("POST", apiUrl[level], data).then(r => r.json());
      } else {
        return apiRequest("PATCH", `${apiUrl[level]}/${id}`, data).then(r => r.json());
      }
    },
    onSuccess: () => {
      queryKeys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast({ title: "Saved", description: `${drawer.level} ${drawer.mode === "create" ? "created" : "updated"} successfully.` });
      closeDrawer();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ level, id }: { level: EditLevel; id: string }) => {
      return apiRequest("DELETE", `${apiUrl[level]}/${id}`);
    },
    onSuccess: () => {
      queryKeys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast({ title: "Deleted" });
      setDeleteTarget(null);
      if (deleteTarget?.level === "group" && deleteTarget.id === selectedGroupId) {
        setSelectedGroupId(null);
        setMobileEditorOpen(false);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  function handleConfirmSave() {
    const { level, mode, data, parentIds } = drawer;
    const payload = { ...data };
    if (mode === "create") {
      if (level === "entity") payload.group_id = parentIds.groupId;
      if (level === "bic") payload.legal_entity_id = parentIds.entityId;
      if (level === "service") payload.bic_id = parentIds.bicId;
      if (level === "fmi") payload.legal_entity_id = parentIds.entityId;
    }
    saveMutation.mutate({ level, mode, data: payload, id: data.id });
  }

  const levelLabel: Record<EditLevel, string> = { group: "Banking Group", entity: "Legal Entity", bic: "BIC", service: "CB Service", fmi: "FMI Membership" };

  function renderGroupHeader() {
    if (!selectedGroup) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select a banking group to edit</div>;
    const g = selectedGroup;
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4" data-testid={`registry-group-header-${g.id}`}>
        <div className="flex items-center justify-between mb-2">
          <button className="lg:hidden mr-2 text-slate-500" onClick={() => setMobileEditorOpen(false)} data-testid="button-close-mobile-editor"><X className="w-5 h-5" /></button>
          <h2 className="font-bold text-lg flex-1 truncate" data-testid="text-group-name">{g.group_name}</h2>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => openDrawer("edit", "group", g)} data-testid="button-edit-group"><Pencil className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => setDeleteTarget({ id: g.id, level: "group", label: g.group_name })} data-testid="button-delete-group"><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          {g.headquarters_country && <Badge variant="outline">{g.headquarters_country}</Badge>}
          {g.primary_currency && <Badge variant="secondary">{g.primary_currency}</Badge>}
          {g.gsib_status && g.gsib_status !== "N/A" && <Badge className="bg-blue-100 text-blue-700">{g.gsib_status}</Badge>}
          {g.cb_probability && <Badge variant="outline">{g.cb_probability}</Badge>}
          {g.rtgs_system && <Badge variant="outline">{g.rtgs_system}{g.rtgs_member ? " ✓" : ""}</Badge>}
        </div>
      </div>
    );
  }

  function renderTree() {
    if (!selectedGroup) return null;
    return (
      <div className="space-y-2">
        {groupEntities.map(entity => {
          const entityBics = getBicsForEntity(entity.id);
          const entityFmis = getFmisForEntity(entity.id);
          const isExpanded = expandedEntities.has(entity.id);
          return (
            <div key={entity.id} className="border border-slate-200 rounded-lg bg-white" data-testid={`registry-entity-${entity.id}`}>
              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50" onClick={() => toggleEntity(entity.id)}>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                <Landmark className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="font-medium text-sm flex-1 truncate" data-testid={`text-entity-name-${entity.id}`}>{entity.legal_name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{entity.country || "?"}</Badge>
                <Badge variant="outline" className="text-[10px] shrink-0">{entity.entity_type || "Bank"}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openDrawer("edit", "entity", entity); }} data-testid={`button-edit-entity-${entity.id}`}><Pencil className="w-3 h-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={e => { e.stopPropagation(); setDeleteTarget({ id: entity.id, level: "entity", label: entity.legal_name }); }} data-testid={`button-delete-entity-${entity.id}`}><Trash2 className="w-3 h-3" /></Button>
              </div>
              {isExpanded && (
                <div className="border-t border-slate-100 px-3 pb-3 pt-2 ml-4 space-y-2">
                  {entityBics.map(bic => {
                    const bicServices = getServicesForBic(bic.id);
                    const bicExpanded = expandedBics.has(bic.id);
                    return (
                      <div key={bic.id} className="border border-slate-100 rounded-md bg-slate-50/50" data-testid={`registry-bic-${bic.id}`}>
                        <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-100/50" onClick={() => toggleBic(bic.id)}>
                          {bicExpanded ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
                          <CreditCard className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <code className="text-xs font-mono font-medium flex-1" data-testid={`text-bic-code-${bic.id}`}>{bic.bic_code}</code>
                          {bic.is_headquarters && <Badge className="bg-amber-100 text-amber-700 text-[9px]">HQ</Badge>}
                          {bic.city && <span className="text-[10px] text-slate-500">{bic.city}</span>}
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); openDrawer("edit", "bic", bic); }} data-testid={`button-edit-bic-${bic.id}`}><Pencil className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={e => { e.stopPropagation(); setDeleteTarget({ id: bic.id, level: "bic", label: bic.bic_code }); }} data-testid={`button-delete-bic-${bic.id}`}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                        {bicExpanded && (
                          <div className="border-t border-slate-100 px-3 pb-2 pt-1 ml-4 space-y-1">
                            {bicServices.map(svc => (
                              <div key={svc.id} className="flex items-center gap-2 py-1 text-xs" data-testid={`registry-service-${svc.id}`}>
                                <Globe className="w-3 h-3 text-blue-500 shrink-0" />
                                <span className="font-medium">{svc.currency}</span>
                                <span className="text-slate-500">{svc.service_type}</span>
                                <Badge variant="outline" className="text-[9px]">{svc.clearing_model}</Badge>
                                {svc.rtgs_membership && <Badge className="bg-green-100 text-green-700 text-[9px]">RTGS</Badge>}
                                <div className="ml-auto flex gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openDrawer("edit", "service", svc)} data-testid={`button-edit-service-${svc.id}`}><Pencil className="w-2.5 h-2.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-5 w-5 text-red-500" onClick={() => setDeleteTarget({ id: svc.id, level: "service", label: `${svc.currency} ${svc.service_type}` })} data-testid={`button-delete-service-${svc.id}`}><Trash2 className="w-2.5 h-2.5" /></Button>
                                </div>
                              </div>
                            ))}
                            <button
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 py-1"
                              onClick={() => openDrawer("create", "service", {}, { bicId: bic.id })}
                              data-testid={`button-add-service-${bic.id}`}
                            >
                              <Plus className="w-3 h-3" /> Add CB Service
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 py-1"
                    onClick={() => openDrawer("create", "bic", {}, { entityId: entity.id })}
                    data-testid={`button-add-bic-${entity.id}`}
                  >
                    <Plus className="w-3 h-3" /> Add BIC
                  </button>

                  <div className="border-t border-slate-100 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1.5">
                      <Shield className="w-3 h-3 text-violet-500" />
                      <span className="text-xs font-medium text-slate-600">FMI Memberships</span>
                    </div>
                    {entityFmis.map(fmi => (
                      <div key={fmi.id} className="flex items-center gap-2 py-0.5 text-xs" data-testid={`registry-fmi-${fmi.id}`}>
                        <span className="font-medium">{fmi.fmi_name}</span>
                        <span className="text-slate-500">{fmi.fmi_type}</span>
                        <div className="ml-auto flex gap-0.5">
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openDrawer("edit", "fmi", fmi)} data-testid={`button-edit-fmi-${fmi.id}`}><Pencil className="w-2.5 h-2.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-red-500" onClick={() => setDeleteTarget({ id: fmi.id, level: "fmi", label: fmi.fmi_name || "FMI" })} data-testid={`button-delete-fmi-${fmi.id}`}><Trash2 className="w-2.5 h-2.5" /></Button>
                        </div>
                      </div>
                    ))}
                    <button
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 py-1"
                      onClick={() => openDrawer("create", "fmi", {}, { entityId: entity.id })}
                      data-testid={`button-add-fmi-${entity.id}`}
                    >
                      <Plus className="w-3 h-3" /> Add FMI
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 py-2 px-3"
          onClick={() => openDrawer("create", "entity", {}, { groupId: selectedGroupId! })}
          data-testid="button-add-entity"
        >
          <Plus className="w-4 h-4" /> Add Legal Entity
        </button>
      </div>
    );
  }

  function renderFormField(key: string, val: any, onChange: (v: any) => void, fieldConfig: { type: string; label: string; options?: string[]; placeholder?: string }) {
    const { type, label: fieldLabel, options, placeholder } = fieldConfig;

    if (type === "boolean") {
      return (
        <div key={key} className="flex items-center gap-2">
          <Checkbox id={key} checked={!!val} onCheckedChange={onChange} data-testid={`checkbox-${key}`} />
          <Label htmlFor={key} className="text-sm">{fieldLabel}</Label>
        </div>
      );
    }
    if (type === "select" && options) {
      return (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-600">{fieldLabel}</Label>
          <Select value={val || ""} onValueChange={onChange}>
            <SelectTrigger data-testid={`select-${key}`}><SelectValue placeholder={placeholder || `Select ${fieldLabel}`} /></SelectTrigger>
            <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    }
    if (type === "textarea") {
      return (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-600">{fieldLabel}</Label>
          <Textarea value={val || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} data-testid={`textarea-${key}`} className="min-h-[60px]" />
        </div>
      );
    }
    return (
      <div key={key} className="space-y-1">
        <Label className="text-xs text-slate-600">{fieldLabel}</Label>
        <Input value={val || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} data-testid={`input-${key}`} />
      </div>
    );
  }

  type FieldDef = { key: string; type: string; label: string; options?: string[]; placeholder?: string };

  const fieldDefs: Record<EditLevel, FieldDef[]> = {
    group: [
      { key: "group_name", type: "text", label: "Group Name", placeholder: "e.g. Deutsche Bank" },
      { key: "headquarters_country", type: "text", label: "HQ Country", placeholder: "e.g. Germany" },
      { key: "primary_currency", type: "select", label: "Primary Currency", options: CB_CURRENCIES },
      { key: "rtgs_system", type: "text", label: "RTGS System", placeholder: "e.g. TARGET2" },
      { key: "rtgs_member", type: "boolean", label: "RTGS Member" },
      { key: "gsib_status", type: "select", label: "G-SIB Status", options: GSIB_OPTIONS },
      { key: "cb_probability", type: "select", label: "CB Probability", options: CB_PROBS },
      { key: "cb_evidence", type: "textarea", label: "CB Evidence", placeholder: "Brief description of CB evidence" },
      { key: "website", type: "text", label: "Website", placeholder: "https://..." },
      { key: "notes", type: "textarea", label: "Notes" },
    ],
    entity: [
      { key: "legal_name", type: "text", label: "Legal Name", placeholder: "e.g. Deutsche Bank AG" },
      { key: "country", type: "text", label: "Country", placeholder: "e.g. Germany" },
      { key: "entity_type", type: "select", label: "Entity Type", options: ENTITY_TYPES },
      { key: "regulator", type: "text", label: "Regulator", placeholder: "e.g. BaFin" },
      { key: "notes", type: "textarea", label: "Notes" },
    ],
    bic: [
      { key: "bic_code", type: "text", label: "BIC Code", placeholder: "e.g. DEUTDEFFXXX" },
      { key: "city", type: "text", label: "City", placeholder: "e.g. Frankfurt" },
      { key: "country", type: "text", label: "Country", placeholder: "e.g. Germany" },
      { key: "is_headquarters", type: "boolean", label: "Headquarters BIC" },
      { key: "swift_member", type: "boolean", label: "SWIFT Member" },
      { key: "notes", type: "textarea", label: "Notes" },
    ],
    service: [
      { key: "currency", type: "select", label: "Currency", options: CB_CURRENCIES },
      { key: "service_type", type: "select", label: "Service Type", options: SERVICE_TYPES.filter(s => s !== "all") },
      { key: "clearing_model", type: "select", label: "Clearing Model", options: CLEARING_MODELS },
      { key: "rtgs_membership", type: "boolean", label: "RTGS Membership" },
      { key: "instant_scheme_access", type: "boolean", label: "Instant Scheme Access" },
      { key: "nostro_accounts_offered", type: "boolean", label: "Nostro Accounts Offered" },
      { key: "vostro_accounts_offered", type: "boolean", label: "Vostro Accounts Offered" },
      { key: "cls_member", type: "boolean", label: "CLS Member" },
      { key: "target_clients", type: "text", label: "Target Clients", placeholder: "e.g. Banks, FIs, Corporates" },
      { key: "source", type: "text", label: "Source", placeholder: "e.g. Official website" },
      { key: "notes", type: "textarea", label: "Notes" },
    ],
    fmi: [
      { key: "fmi_name", type: "text", label: "FMI Name", placeholder: "e.g. TARGET2" },
      { key: "fmi_type", type: "select", label: "FMI Type", options: FMI_TYPES },
      { key: "member_since", type: "text", label: "Member Since", placeholder: "YYYY-MM-DD" },
      { key: "source", type: "text", label: "Source", placeholder: "e.g. ECB website" },
      { key: "notes", type: "textarea", label: "Notes" },
    ],
  };

  function renderDrawerContent() {
    const { mode, level, data, step } = drawer;
    const title = `${mode === "create" ? "New" : "Edit"} ${levelLabel[level]}`;
    const fields = fieldDefs[level];

    if (step === "review") {
      return (
        <>
          <SheetHeader>
            <SheetTitle>{title} — Review</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-500">Please review the details below before saving.</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              {fields.map(f => {
                const v = data[f.key];
                if (v === undefined || v === null || v === "") return null;
                return (
                  <div key={f.key} className="flex justify-between text-sm">
                    <span className="text-slate-500">{f.label}</span>
                    <span className="font-medium text-right max-w-[60%] break-words" data-testid={`review-${f.key}`}>{typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDrawer(prev => ({ ...prev, step: "form" }))} data-testid="button-back-to-edit">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Edit
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleConfirmSave} disabled={saveMutation.isPending} data-testid="button-confirm-save">
                <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Saving…" : "Confirm & Save"}
              </Button>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {fields.map(f =>
            renderFormField(
              f.key,
              data[f.key],
              (v) => setDrawer(prev => ({ ...prev, data: { ...prev.data, [f.key]: v } })),
              f
            )
          )}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={closeDrawer} data-testid="button-cancel-edit">Cancel</Button>
            <Button className="flex-1" onClick={() => setDrawer(prev => ({ ...prev, step: "review" }))} data-testid="button-review">
              Review
            </Button>
          </div>
        </div>
      </>
    );
  }

  const editorContent = (
    <div className="space-y-4">
      {renderGroupHeader()}
      {renderTree()}
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold" data-testid="text-page-title">Registry</h1>
        <Button size="sm" onClick={() => openDrawer("create", "group")} data-testid="button-new-group">
          <Plus className="w-4 h-4 mr-1" /> New Banking Group
        </Button>
      </div>

      <div className="flex gap-6">
        {/* Left panel — group browser */}
        <div className="w-full lg:w-80 lg:shrink-0">
          <div className="mb-3 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search groups, BICs…"
                  className="pl-8 text-sm"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  data-testid="input-registry-search"
                />
              </div>
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                data-testid="button-toggle-filters"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                <Select value={filterCurrency} onValueChange={setFilterCurrency}>
                  <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-reg-filter-currency"><SelectValue placeholder="Currency" /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c === "all" ? "All CCY" : c}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterServiceType} onValueChange={setFilterServiceType}>
                  <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-reg-filter-service-type"><SelectValue placeholder="Service Type" /></SelectTrigger>
                  <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s === "all" ? "All Types" : s}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterGsib} onValueChange={setFilterGsib}>
                  <SelectTrigger className="w-24 h-8 text-xs" data-testid="select-reg-filter-gsib"><SelectValue placeholder="SIB" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="G-SIB">G-SIB</SelectItem>
                    <SelectItem value="D-SIB">D-SIB</SelectItem>
                    <SelectItem value="N/A">N/A</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex rounded border border-slate-200 overflow-hidden text-[11px]">
                  <button onClick={() => setFilterIntel("all")} className={`px-2 py-1 ${filterIntel === "all" ? "bg-slate-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`} data-testid="reg-intel-all">All</button>
                  <button onClick={() => setFilterIntel(filterIntel === "competitor" ? "all" : "competitor")} className={`flex items-center gap-0.5 px-2 py-1 border-l border-slate-200 ${filterIntel === "competitor" ? "bg-orange-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`} data-testid="reg-intel-competitor"><Swords className="w-2.5 h-2.5" /> Comp</button>
                  <button onClick={() => setFilterIntel(filterIntel === "cb_provider" ? "all" : "cb_provider")} className={`flex items-center gap-0.5 px-2 py-1 border-l border-slate-200 ${filterIntel === "cb_provider" ? "bg-violet-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`} data-testid="reg-intel-cb"><Building2 className="w-2.5 h-2.5" /> CB</button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
            {filteredGroups.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No groups match filters</p>}
            {filteredGroups.map(g => (
              <button
                key={g.id}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  g.id === selectedGroupId ? "bg-blue-50 border-blue-300 font-medium" : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
                onClick={() => selectGroup(g.id)}
                data-testid={`button-select-group-${g.id}`}
              >
                <div className="font-medium truncate">{g.group_name}</div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500">
                  {g.headquarters_country && <span>{g.headquarters_country}</span>}
                  {g.primary_currency && <span>· {g.primary_currency}</span>}
                  {g.gsib_status && g.gsib_status !== "N/A" && <Badge className="bg-blue-100 text-blue-700 text-[9px] h-4">{g.gsib_status}</Badge>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — editor (desktop only, inline) */}
        <div className="flex-1 min-w-0 hidden lg:block">
          {editorContent}
        </div>
      </div>

      {/* Mobile editor — full-screen Sheet below lg */}
      <Sheet open={mobileEditorOpen && !!selectedGroupId} onOpenChange={open => { if (!open) setMobileEditorOpen(false); }}>
        <SheetContent side="bottom" className="lg:hidden h-[95vh] overflow-y-auto rounded-t-2xl" data-testid="sheet-mobile-editor">
          <SheetHeader>
            <SheetTitle className="sr-only">Group Editor</SheetTitle>
          </SheetHeader>
          {editorContent}
        </SheetContent>
      </Sheet>

      {/* Edit drawer */}
      <Sheet open={drawer.open} onOpenChange={open => { if (!open) closeDrawer(); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {renderDrawerContent()}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget ? levelLabel[deleteTarget.level] : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>? This action cannot be undone.
              {deleteTarget?.level === "group" && " All associated entities, BICs, and services will also be removed."}
              {deleteTarget?.level === "entity" && " All associated BICs, services, and FMI memberships will also be removed."}
              {deleteTarget?.level === "bic" && " All associated services will also be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate({ level: deleteTarget.level, id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
