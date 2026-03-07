import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2, Save, X } from "lucide-react";
import type { BankingGroup, LegalEntity, Bic, CorrespondentService, Fmi } from "@shared/schema";

const CURRENCIES = ["EUR","USD","GBP","JPY","CHF","CAD","AUD","SGD","HKD","CNH","SEK","NOK","DKK","PLN","CZK","HUF","RON","TRY","ZAR","BRL","MXN","INR"];
const SERVICE_TYPES = ["Correspondent Banking","Currency Clearing","RTGS Participation","Instant Payments Access","FX Liquidity","CLS Settlement","CLS Third Party Settlement","CLS Nostro Payments","Custody Services","Transaction Banking","Liquidity Services"];

function GroupForm({ initial, groups, onSave, onCancel }: { initial?: Partial<BankingGroup>; groups?: BankingGroup[]; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState<any>(initial || { group_name: "", headquarters_country: "", primary_currency: "", gsib_status: "N/A", website: "", notes: "" });
  return (
    <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Group Name *</Label><Input data-testid="input-group-name" value={form.group_name} onChange={e => setForm((p: any) => ({ ...p, group_name: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">HQ Country</Label><Input data-testid="input-hq-country" value={form.headquarters_country || ""} onChange={e => setForm((p: any) => ({ ...p, headquarters_country: e.target.value }))} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Primary Currency</Label>
          <Select value={form.primary_currency || ""} onValueChange={v => setForm((p: any) => ({ ...p, primary_currency: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">G-SIB Status</Label>
          <Select value={form.gsib_status || "N/A"} onValueChange={v => setForm((p: any) => ({ ...p, gsib_status: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="G-SIB">G-SIB</SelectItem>
              <SelectItem value="D-SIB">D-SIB</SelectItem>
              <SelectItem value="N/A">N/A</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Website</Label><Input value={form.website || ""} onChange={e => setForm((p: any) => ({ ...p, website: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">Notes</Label><Input value={form.notes || ""} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} className="mt-1" /></div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-group"><Save className="w-3 h-3 mr-1" />Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3 h-3 mr-1" />Cancel</Button>
      </div>
    </div>
  );
}

function EntityForm({ initial, groups, onSave, onCancel }: { initial?: Partial<LegalEntity>; groups: BankingGroup[]; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState<any>(initial || { group_id: "", group_name: "", legal_name: "", country: "", entity_type: "Bank", regulator: "", notes: "" });
  return (
    <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Banking Group *</Label>
          <Select value={form.group_id} onValueChange={v => { const g = groups.find(g => g.id === v); setForm((p: any) => ({ ...p, group_id: v, group_name: g?.group_name || "" })); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select group" /></SelectTrigger>
            <SelectContent>{groups.map(g => <SelectItem key={g.id} value={g.id}>{g.group_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Legal Name *</Label><Input data-testid="input-legal-name" value={form.legal_name} onChange={e => setForm((p: any) => ({ ...p, legal_name: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">Country</Label><Input value={form.country || ""} onChange={e => setForm((p: any) => ({ ...p, country: e.target.value }))} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Entity Type</Label>
          <Select value={form.entity_type} onValueChange={v => setForm((p: any) => ({ ...p, entity_type: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{["Bank","Branch","Subsidiary","Representative Office","Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Regulator</Label><Input value={form.regulator || ""} onChange={e => setForm((p: any) => ({ ...p, regulator: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">Notes</Label><Input value={form.notes || ""} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} className="mt-1" /></div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-entity"><Save className="w-3 h-3 mr-1" />Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3 h-3 mr-1" />Cancel</Button>
      </div>
    </div>
  );
}

function BICForm({ initial, entities, onSave, onCancel }: { initial?: Partial<Bic>; entities: LegalEntity[]; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState<any>(initial || { legal_entity_id: "", legal_entity_name: "", bic_code: "", country: "", city: "", is_headquarters: false, swift_member: true, notes: "" });
  return (
    <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Legal Entity *</Label>
          <Select value={form.legal_entity_id} onValueChange={v => { const e = entities.find(e => e.id === v); setForm((p: any) => ({ ...p, legal_entity_id: v, legal_entity_name: e?.legal_name || "" })); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select entity" /></SelectTrigger>
            <SelectContent>{entities.map(e => <SelectItem key={e.id} value={e.id}>{e.legal_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">BIC Code *</Label><Input data-testid="input-bic-code" value={form.bic_code} onChange={e => setForm((p: any) => ({ ...p, bic_code: e.target.value.toUpperCase() }))} className="mt-1 font-mono" /></div>
        <div><Label className="text-xs">Country</Label><Input value={form.country || ""} onChange={e => setForm((p: any) => ({ ...p, country: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">City</Label><Input value={form.city || ""} onChange={e => setForm((p: any) => ({ ...p, city: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">Notes</Label><Input value={form.notes || ""} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} className="mt-1" /></div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer"><Checkbox checked={!!form.is_headquarters} onCheckedChange={v => setForm((p: any) => ({ ...p, is_headquarters: !!v }))} />HQ BIC</label>
        <label className="flex items-center gap-2 text-xs cursor-pointer"><Checkbox checked={!!form.swift_member} onCheckedChange={v => setForm((p: any) => ({ ...p, swift_member: !!v }))} />SWIFT Member</label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-bic"><Save className="w-3 h-3 mr-1" />Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3 h-3 mr-1" />Cancel</Button>
      </div>
    </div>
  );
}

function ServiceForm({ initial, bics, onSave, onCancel }: { initial?: Partial<CorrespondentService>; bics: Bic[]; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState<any>(initial || { bic_id: "", bic_code: "", group_name: "", legal_entity_name: "", country: "", currency: "USD", service_type: "Correspondent Banking", clearing_model: "", rtgs_membership: false, instant_scheme_access: false, nostro_accounts_offered: false, vostro_accounts_offered: false, cls_member: false, target_clients: "", notes: "", source: "", last_verified: "" });
  return (
    <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">BIC *</Label>
          <Select value={form.bic_id} onValueChange={v => { const b = bics.find(b => b.id === v); setForm((p: any) => ({ ...p, bic_id: v, bic_code: b?.bic_code || "", legal_entity_name: b?.legal_entity_name || "", country: b?.country || "" })); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select BIC" /></SelectTrigger>
            <SelectContent>{bics.map(b => <SelectItem key={b.id} value={b.id}>{b.bic_code} — {b.legal_entity_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Group Name</Label><Input value={form.group_name || ""} onChange={e => setForm((p: any) => ({ ...p, group_name: e.target.value }))} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Currency *</Label>
          <Select value={form.currency} onValueChange={v => setForm((p: any) => ({ ...p, currency: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Service Type *</Label>
          <Select value={form.service_type} onValueChange={v => setForm((p: any) => ({ ...p, service_type: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Clearing Model</Label>
          <Select value={form.clearing_model || ""} onValueChange={v => setForm((p: any) => ({ ...p, clearing_model: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Onshore">Onshore</SelectItem>
              <SelectItem value="Offshore">Offshore</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Target Clients</Label><Input value={form.target_clients || ""} onChange={e => setForm((p: any) => ({ ...p, target_clients: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">Source</Label><Input value={form.source || ""} onChange={e => setForm((p: any) => ({ ...p, source: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">Last Verified</Label><Input type="date" value={form.last_verified || ""} onChange={e => setForm((p: any) => ({ ...p, last_verified: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">Notes</Label><Input value={form.notes || ""} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} className="mt-1" /></div>
      </div>
      <div className="flex flex-wrap gap-4">
        {([["rtgs_membership","RTGS Member"],["instant_scheme_access","Instant Payments"],["nostro_accounts_offered","Nostro Offered"],["vostro_accounts_offered","Vostro Offered"],["cls_member","CLS Member"]] as [string, string][]).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={!!form[k]} onCheckedChange={v => setForm((p: any) => ({ ...p, [k]: !!v }))} />{l}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-service"><Save className="w-3 h-3 mr-1" />Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3 h-3 mr-1" />Cancel</Button>
      </div>
    </div>
  );
}

const FMI_CATEGORIES = [
  "Payment Systems",
  "Instant Payment Systems",
  "Securities Settlement Systems",
  "Central Securities Depositories",
  "Central Counterparties",
  "Trade Repositories",
  "FX Settlement Systems",
  "Messaging Networks",
] as const;

function FMIForm({ initial, entities, onSave, onCancel }: { initial?: Partial<Fmi>; entities: LegalEntity[]; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState<any>(initial || { legal_entity_id: "", legal_entity_name: "", fmi_type: "", fmi_name: "", member_since: "", notes: "", last_verified: "" });
  return (
    <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Legal Entity *</Label>
          <Select value={form.legal_entity_id} onValueChange={v => { const e = entities.find(e => e.id === v); setForm((p: any) => ({ ...p, legal_entity_id: v, legal_entity_name: e?.legal_name || "" })); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select entity" /></SelectTrigger>
            <SelectContent>{entities.map(e => <SelectItem key={e.id} value={e.id}>{e.legal_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">FMI Category *</Label>
          <Select value={form.fmi_type} onValueChange={v => setForm((p: any) => ({ ...p, fmi_type: v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>{FMI_CATEGORIES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">FMI Name * <span className="text-slate-400 font-normal">(e.g. TARGET2, CLS, LCH, Euroclear, SWIFT)</span></Label>
          <Input value={form.fmi_name || ""} onChange={e => setForm((p: any) => ({ ...p, fmi_name: e.target.value }))} className="mt-1" placeholder="Specific FMI name" data-testid="input-fmi-name" />
        </div>
        <div><Label className="text-xs">Member Since</Label><Input type="date" value={form.member_since || ""} onChange={e => setForm((p: any) => ({ ...p, member_since: e.target.value }))} className="mt-1" /></div>
        <div><Label className="text-xs">Last Verified</Label><Input type="date" value={form.last_verified || ""} onChange={e => setForm((p: any) => ({ ...p, last_verified: e.target.value }))} className="mt-1" /></div>
        <div className="col-span-2"><Label className="text-xs">Notes</Label><Input value={form.notes || ""} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} className="mt-1" /></div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)} className="bg-blue-600 hover:bg-blue-700" data-testid="button-save-fmi"><Save className="w-3 h-3 mr-1" />Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3 h-3 mr-1" />Cancel</Button>
      </div>
    </div>
  );
}

function useCrud<T extends { id: string }>(apiPath: string) {
  const { data = [], isLoading } = useQuery<T[]>({ queryKey: [apiPath] });
  const create = useMutation({
    mutationFn: (d: any) => apiRequest("POST", apiPath, d),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [apiPath] }),
  });
  const update = useMutation({
    mutationFn: ({ id, ...d }: any) => apiRequest("PATCH", `${apiPath}/${id}`, d),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [apiPath] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `${apiPath}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [apiPath] }),
  });
  return { data, isLoading, create, update, remove };
}

export default function DatabaseAdmin() {
  const groups = useCrud<BankingGroup>("/api/banking-groups");
  const entities = useCrud<LegalEntity>("/api/legal-entities");
  const bicsData = useCrud<Bic>("/api/bics");
  const services = useCrud<CorrespondentService>("/api/correspondent-services");
  const fmisData = useCrud<Fmi>("/api/fmis");

  const [showForm, setShowForm] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);

  const handleSave = async (crud: ReturnType<typeof useCrud>, form: any) => {
    if (form.id) await crud.update.mutateAsync(form);
    else await crud.create.mutateAsync(form);
    setShowForm(null);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Database Admin</h1>
        <p className="text-slate-500 text-sm mt-1">Manage all correspondent banking data</p>
      </div>

      <Tabs defaultValue="groups">
        <TabsList className="mb-4">
          <TabsTrigger value="groups" data-testid="tab-groups">Banking Groups ({groups.data.length})</TabsTrigger>
          <TabsTrigger value="entities" data-testid="tab-entities">Legal Entities ({entities.data.length})</TabsTrigger>
          <TabsTrigger value="bics" data-testid="tab-bics">BICs ({bicsData.data.length})</TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-services">Services ({services.data.length})</TabsTrigger>
          <TabsTrigger value="fmis" data-testid="tab-fmis">FMIs ({fmisData.data.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="groups">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-group" onClick={() => { setShowForm("group"); setEditing(null); }}>
                <Plus className="w-3 h-3 mr-1" />Add Banking Group
              </Button>
              {showForm === "group" && <GroupForm initial={editing} onSave={d => handleSave(groups, d)} onCancel={() => setShowForm(null)} />}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-slate-50 text-slate-600"><th className="text-left p-3">Name</th><th className="text-left p-3">HQ Country</th><th className="text-left p-3">Currency</th><th className="text-left p-3">G-SIB</th><th className="p-3"></th></tr></thead>
                  <tbody>
                    {groups.data.map(g => (
                      <tr key={g.id} className="border-b hover:bg-slate-50" data-testid={`row-group-${g.id}`}>
                        <td className="p-3 font-medium">{g.group_name}</td>
                        <td className="p-3 text-slate-600">{g.headquarters_country}</td>
                        <td className="p-3 text-slate-600">{g.primary_currency}</td>
                        <td className="p-3">{g.gsib_status && g.gsib_status !== "N/A" && <Badge className="text-xs">{g.gsib_status}</Badge>}</td>
                        <td className="p-3 flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" data-testid={`button-edit-group-${g.id}`} onClick={() => { setShowForm("group"); setEditing(g); }}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" data-testid={`button-delete-group-${g.id}`} onClick={() => groups.remove.mutate(g.id)}><Trash2 className="w-3 h-3" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entities">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-entity" onClick={() => { setShowForm("entity"); setEditing(null); }}>
                <Plus className="w-3 h-3 mr-1" />Add Legal Entity
              </Button>
              {showForm === "entity" && <EntityForm initial={editing} groups={groups.data} onSave={d => handleSave(entities, d)} onCancel={() => setShowForm(null)} />}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-slate-50 text-slate-600"><th className="text-left p-3">Legal Name</th><th className="text-left p-3">Group</th><th className="text-left p-3">Country</th><th className="text-left p-3">Type</th><th className="p-3"></th></tr></thead>
                  <tbody>
                    {entities.data.map(e => (
                      <tr key={e.id} className="border-b hover:bg-slate-50" data-testid={`row-entity-${e.id}`}>
                        <td className="p-3 font-medium">{e.legal_name}</td>
                        <td className="p-3 text-slate-600">{e.group_name}</td>
                        <td className="p-3 text-slate-600">{e.country}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{e.entity_type}</Badge></td>
                        <td className="p-3 flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => { setShowForm("entity"); setEditing(e); }}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => entities.remove.mutate(e.id)}><Trash2 className="w-3 h-3" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bics">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-bic" onClick={() => { setShowForm("bic"); setEditing(null); }}>
                <Plus className="w-3 h-3 mr-1" />Add BIC
              </Button>
              {showForm === "bic" && <BICForm initial={editing} entities={entities.data} onSave={d => handleSave(bicsData, d)} onCancel={() => setShowForm(null)} />}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-slate-50 text-slate-600"><th className="text-left p-3">BIC Code</th><th className="text-left p-3">Legal Entity</th><th className="text-left p-3">City</th><th className="text-left p-3">Country</th><th className="text-left p-3">Flags</th><th className="p-3"></th></tr></thead>
                  <tbody>
                    {bicsData.data.map(b => (
                      <tr key={b.id} className="border-b hover:bg-slate-50" data-testid={`row-bic-${b.id}`}>
                        <td className="p-3 font-mono font-bold">{b.bic_code}</td>
                        <td className="p-3 text-slate-600">{b.legal_entity_name}</td>
                        <td className="p-3 text-slate-600">{b.city}</td>
                        <td className="p-3 text-slate-600">{b.country}</td>
                        <td className="p-3 flex gap-1">
                          {b.is_headquarters && <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">HQ</Badge>}
                          {b.swift_member && <Badge className="text-xs bg-blue-50 text-blue-700 border-blue-200">SWIFT</Badge>}
                        </td>
                        <td className="p-3 flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => { setShowForm("bic"); setEditing(b); }}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => bicsData.remove.mutate(b.id)}><Trash2 className="w-3 h-3" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-service" onClick={() => { setShowForm("service"); setEditing(null); }}>
                <Plus className="w-3 h-3 mr-1" />Add Service
              </Button>
              {showForm === "service" && <ServiceForm initial={editing} bics={bicsData.data} onSave={d => handleSave(services, d)} onCancel={() => setShowForm(null)} />}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-slate-50 text-slate-600"><th className="text-left p-3">Group</th><th className="text-left p-3">BIC</th><th className="text-left p-3">Currency</th><th className="text-left p-3">Service Type</th><th className="text-left p-3">Model</th><th className="p-3"></th></tr></thead>
                  <tbody>
                    {services.data.map(s => (
                      <tr key={s.id} className="border-b hover:bg-slate-50" data-testid={`row-service-${s.id}`}>
                        <td className="p-3 font-medium">{s.group_name}</td>
                        <td className="p-3 font-mono text-slate-600">{s.bic_code}</td>
                        <td className="p-3 font-semibold text-blue-700">{s.currency}</td>
                        <td className="p-3 text-slate-600">{s.service_type}</td>
                        <td className="p-3">{s.clearing_model && <Badge className={`text-xs ${s.clearing_model === "Onshore" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{s.clearing_model}</Badge>}</td>
                        <td className="p-3 flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => { setShowForm("service"); setEditing(s); }}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => services.remove.mutate(s.id)}><Trash2 className="w-3 h-3" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fmis">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="button-add-fmi" onClick={() => { setShowForm("fmi"); setEditing(null); }}>
                <Plus className="w-3 h-3 mr-1" />Add FMI
              </Button>
              {showForm === "fmi" && <FMIForm initial={editing} entities={entities.data} onSave={d => handleSave(fmisData, d)} onCancel={() => setShowForm(null)} />}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-slate-50 text-slate-600"><th className="text-left p-3">Legal Entity</th><th className="text-left p-3">FMI Name</th><th className="text-left p-3">Category</th><th className="text-left p-3">Member Since</th><th className="text-left p-3">Last Verified</th><th className="p-3"></th></tr></thead>
                  <tbody>
                    {fmisData.data.map(f => (
                      <tr key={f.id} className="border-b hover:bg-slate-50" data-testid={`row-fmi-${f.id}`}>
                        <td className="p-3 font-medium">{f.legal_entity_name}</td>
                        <td className="p-3 font-semibold text-slate-800">{f.fmi_name || "—"}</td>
                        <td className="p-3"><Badge className="text-xs bg-teal-50 text-teal-700 border-teal-200">{f.fmi_type || "—"}</Badge></td>
                        <td className="p-3 text-slate-600">{f.member_since || "—"}</td>
                        <td className="p-3 text-slate-600">{f.last_verified || "—"}</td>
                        <td className="p-3 flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => { setShowForm("fmi"); setEditing(f); }}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => fmisData.remove.mutate(f.id)}><Trash2 className="w-3 h-3" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
