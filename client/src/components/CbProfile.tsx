import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ChevronDown, ChevronRight, Pencil, Trash2, Plus, Loader2,
  Check, X, Minus, Wifi, Target, Sparkles, BarChart3, Lightbulb, Package,
  Shield, Network,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  CbTaxonomyItem, CbCapabilityValue, CbSchemeMaster, CbIndirectParticipation,
  LegalEntity, CorrespondentService,
} from "@shared/schema";

type TaxonomyGrouped = Record<string, CbTaxonomyItem[]>;

const CATEGORY_META: Record<string, { label: string; icon: typeof Wifi; iconClass: string }> = {
  connectivity:       { label: "Connectivity & Technology", icon: Wifi,       iconClass: "text-blue-500" },
  target_market:      { label: "Target Markets",           icon: Target,     iconClass: "text-emerald-500" },
  value_added:        { label: "Value Added Services",     icon: Sparkles,   iconClass: "text-violet-500" },
  fi_score:           { label: "FI Service Model",         icon: BarChart3,  iconClass: "text-amber-500" },
  thought_leadership: { label: "Thought Leadership",       icon: Lightbulb,  iconClass: "text-orange-500" },
  ancillary:          { label: "Ancillary Services",       icon: Package,    iconClass: "text-slate-500" },
};

const GROUP_CATEGORIES = ["connectivity", "target_market", "value_added", "fi_score", "thought_leadership", "ancillary"];
const SERVICE_CATEGORIES = ["feature_commercial", "feature_treasury"];

function getCapValue(cap: CbCapabilityValue | undefined): string {
  if (!cap) return "unknown";
  if (cap.value_enum) return cap.value_enum;
  if (cap.value_numeric !== null && cap.value_numeric !== undefined) return String(cap.value_numeric);
  if (cap.value_text) return cap.value_text;
  return "unknown";
}

function BooleanBadge({ value }: { value: string }) {
  if (value === "yes") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1" data-testid="badge-yes"><Check className="w-3 h-3" /> Yes</Badge>;
  if (value === "no") return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1" data-testid="badge-no"><X className="w-3 h-3" /> No</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs gap-1" data-testid="badge-unknown"><Minus className="w-3 h-3" /> Unknown</Badge>;
}

function EnumBadge({ value }: { value: string }) {
  if (value === "high") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">High</Badge>;
  if (value === "medium") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Medium</Badge>;
  if (value === "low") return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Low</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs">Unknown</Badge>;
}

function ScoreBar({ value }: { value: string }) {
  const n = parseInt(value);
  if (isNaN(n)) return <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs">—</Badge>;
  const pct = (n / 10) * 100;
  const color = n >= 7 ? "bg-emerald-500" : n >= 4 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-700 w-5 text-right">{n}</span>
    </div>
  );
}

function ValueDisplay({ item, cap }: { item: CbTaxonomyItem; cap: CbCapabilityValue | undefined }) {
  const val = getCapValue(cap);
  if (item.value_type === "boolean_unknown") return <BooleanBadge value={val} />;
  if (item.value_type === "enum_high_med_low") return <EnumBadge value={val} />;
  if (item.value_type === "score_1_10") return <ScoreBar value={val} />;
  if (item.value_type === "count") return <span className="text-sm font-medium text-slate-700">{val === "unknown" ? "—" : val}</span>;
  return <span className="text-sm text-slate-600">{val === "unknown" ? "—" : val}</span>;
}

interface EditCapDialogProps {
  item: CbTaxonomyItem;
  cap: CbCapabilityValue | undefined;
  groupId: string;
  entityId?: string;
  serviceId?: string;
  onClose: () => void;
}

function EditCapDialog({ item, cap, groupId, entityId, serviceId, onClose }: EditCapDialogProps) {
  const { toast } = useToast();
  const val = getCapValue(cap);

  const [valueEnum, setValueEnum] = useState(item.value_type === "boolean_unknown" || item.value_type === "enum_high_med_low" ? val : "");
  const [valueNumeric, setValueNumeric] = useState(item.value_type === "score_1_10" || item.value_type === "count" ? (val === "unknown" ? "" : val) : "");
  const [valueText, setValueText] = useState(item.value_type === "text" ? (val === "unknown" ? "" : val) : "");
  const [confidence, setConfidence] = useState(cap?.confidence || "medium");
  const [source, setSource] = useState(cap?.source || "");
  const [notes, setNotes] = useState(cap?.notes || "");

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        banking_group_id: groupId,
        taxonomy_item_id: item.id,
        confidence,
        source: source || null,
        notes: notes || null,
        ai_generated: false,
      };
      if (entityId) body.legal_entity_id = entityId;
      if (serviceId) body.correspondent_service_id = serviceId;

      if (item.value_type === "boolean_unknown" || item.value_type === "enum_high_med_low") {
        body.value_enum = valueEnum === "unknown" ? null : valueEnum;
      } else if (item.value_type === "score_1_10" || item.value_type === "count") {
        body.value_numeric = valueNumeric ? parseInt(valueNumeric) : null;
      } else {
        body.value_text = valueText || null;
      }
      return apiRequest("PUT", "/api/cb-capabilities", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cb-capabilities/${groupId}`] });
      toast({ title: "Saved", description: `${item.name} updated` });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/cb-capabilities/${cap!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cb-capabilities/${groupId}`] });
      toast({ title: "Deleted", description: `${item.name} reset to unknown` });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="edit-capability-dialog">
        <DialogHeader>
          <DialogTitle className="text-sm">{item.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {item.value_type === "boolean_unknown" && (
            <div className="flex gap-2">
              {["yes", "no", "unknown"].map(v => (
                <button
                  key={v}
                  data-testid={`cap-val-${v}`}
                  onClick={() => setValueEnum(v)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    valueEnum === v
                      ? v === "yes" ? "bg-emerald-500 border-emerald-500 text-white"
                        : v === "no" ? "bg-red-500 border-red-500 text-white"
                        : "bg-slate-500 border-slate-500 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {v === "yes" ? "Yes" : v === "no" ? "No" : "Unknown"}
                </button>
              ))}
            </div>
          )}

          {item.value_type === "enum_high_med_low" && (
            <div className="flex gap-2">
              {["high", "medium", "low", "unknown"].map(v => (
                <button
                  key={v}
                  data-testid={`cap-val-${v}`}
                  onClick={() => setValueEnum(v)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    valueEnum === v
                      ? v === "high" ? "bg-emerald-500 border-emerald-500 text-white"
                        : v === "medium" ? "bg-amber-500 border-amber-500 text-white"
                        : v === "low" ? "bg-red-500 border-red-500 text-white"
                        : "bg-slate-500 border-slate-500 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          )}

          {item.value_type === "score_1_10" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Score (1–10)</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={valueNumeric}
                onChange={e => setValueNumeric(e.target.value)}
                data-testid="cap-val-score"
                className="text-sm"
              />
            </div>
          )}

          {item.value_type === "count" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Count</label>
              <Input
                type="number"
                min={0}
                value={valueNumeric}
                onChange={e => setValueNumeric(e.target.value)}
                data-testid="cap-val-count"
                className="text-sm"
              />
            </div>
          )}

          {item.value_type === "text" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Value</label>
              <Input
                value={valueText}
                onChange={e => setValueText(e.target.value)}
                data-testid="cap-val-text"
                className="text-sm"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Confidence</label>
            <Select value={confidence} onValueChange={setConfidence}>
              <SelectTrigger data-testid="cap-confidence" className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Source</label>
            <Input
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="e.g. website, annual report"
              data-testid="cap-source"
              className="text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Notes</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              data-testid="cap-notes"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {cap && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50 mr-auto"
              data-testid="cap-delete"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Reset
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="cap-save"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CapabilityRow({
  item, cap, groupId, entityId, serviceId,
}: {
  item: CbTaxonomyItem;
  cap: CbCapabilityValue | undefined;
  groupId: string;
  entityId?: string;
  serviceId?: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div
        className="group flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 transition-colors"
        data-testid={`cap-row-${item.code}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-slate-700">{item.name}</span>
          {cap?.confidence && cap.confidence !== "medium" && (
            <span className={`text-[10px] px-1 py-0.5 rounded ${cap.confidence === "high" ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"}`}>
              {cap.confidence}
            </span>
          )}
          {cap?.ai_generated && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-500">AI</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ValueDisplay item={item} cap={cap} />
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-700"
            onClick={() => setEditing(true)}
            data-testid={`cap-edit-${item.code}`}
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {editing && (
        <EditCapDialog
          item={item}
          cap={cap}
          groupId={groupId}
          entityId={entityId}
          serviceId={serviceId}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

function CategoryPanel({
  category, items, capabilities, groupId,
}: {
  category: string;
  items: CbTaxonomyItem[];
  capabilities: CbCapabilityValue[];
  groupId: string;
}) {
  const [open, setOpen] = useState(true);
  const meta = CATEGORY_META[category];
  if (!meta) return null;
  const Icon = meta.icon;

  const capMap = new Map<string, CbCapabilityValue>();
  for (const c of capabilities) {
    if (!c.legal_entity_id && !c.correspondent_service_id) {
      capMap.set(c.taxonomy_item_id, c);
    }
  }

  const filledCount = items.filter(i => {
    const c = capMap.get(i.id);
    return c && getCapValue(c) !== "unknown";
  }).length;

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden" data-testid={`cat-panel-${category}`}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(p => !p)}
        data-testid={`cat-toggle-${category}`}
      >
        <Icon className={`w-4 h-4 ${meta.iconClass} shrink-0`} />
        <span className="text-sm font-medium text-slate-800 flex-1">{meta.label}</span>
        <span className="text-xs text-slate-400">{filledCount}/{items.length}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-1 py-1">
          {items.map(item => (
            <CapabilityRow
              key={item.id}
              item={item}
              cap={capMap.get(item.id)}
              groupId={groupId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ServiceFeatureBadges({
  groupId, serviceId, capabilities, taxonomy,
}: {
  groupId: string;
  serviceId: string;
  capabilities: CbCapabilityValue[];
  taxonomy: TaxonomyGrouped;
}) {
  const [editing, setEditing] = useState<CbTaxonomyItem | null>(null);

  const svcCaps = capabilities.filter(c => c.correspondent_service_id === serviceId);
  const capMap = new Map<string, CbCapabilityValue>();
  for (const c of svcCaps) capMap.set(c.taxonomy_item_id, c);

  const featureItems = SERVICE_CATEGORIES.flatMap(cat => taxonomy[cat] || []);
  if (featureItems.length === 0) return null;

  const filledItems = featureItems.filter(i => {
    const c = capMap.get(i.id);
    return c && getCapValue(c) !== "unknown";
  });

  return (
    <div className="mt-2 pt-2 border-t border-slate-100" data-testid={`svc-features-${serviceId}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Service Features</span>
        <span className="text-[10px] text-slate-400">{filledItems.length}/{featureItems.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {featureItems.map(item => {
          const cap = capMap.get(item.id);
          const val = getCapValue(cap);
          let badgeClass = "bg-slate-50 text-slate-400 border-slate-200";
          if (val === "yes") badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
          if (val === "no") badgeClass = "bg-red-50 text-red-600 border-red-200";
          return (
            <button
              key={item.id}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs transition-colors hover:ring-1 hover:ring-slate-300 ${badgeClass}`}
              onClick={() => setEditing(item)}
              data-testid={`svc-feat-${item.code}`}
              title={`${item.name}: ${val}`}
            >
              {val === "yes" && <Check className="w-2.5 h-2.5" />}
              {val === "no" && <X className="w-2.5 h-2.5" />}
              {item.name}
            </button>
          );
        })}
      </div>
      {editing && (
        <EditCapDialog
          item={editing}
          cap={capMap.get(editing.id)}
          groupId={groupId}
          serviceId={serviceId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

interface IndirectParticipationSectionProps {
  groupId: string;
  groupName: string;
  entityId: string;
  entityName: string;
}

export function IndirectParticipationSection({ groupId, groupName, entityId, entityName }: IndirectParticipationSectionProps) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  const { data: schemes = [] } = useQuery<CbSchemeMaster[]>({ queryKey: ["/api/cb-schemes"] });
  const { data: records = [] } = useQuery<CbIndirectParticipation[]>({
    queryKey: [`/api/cb-indirect/${groupId}`],
  });

  const entityRecords = records.filter(r => r.legal_entity_id === entityId);

  const [selectedScheme, setSelectedScheme] = useState("");
  const [offered, setOffered] = useState("unknown");
  const [directParticipant, setDirectParticipant] = useState(false);
  const [indNotes, setIndNotes] = useState("");
  const [indSource, setIndSource] = useState("");
  const [indConfidence, setIndConfidence] = useState("medium");

  const saveMutation = useMutation({
    mutationFn: () => {
      const scheme = schemes.find(s => s.id === selectedScheme);
      return apiRequest("PUT", "/api/cb-indirect", {
        legal_entity_id: entityId,
        legal_entity_name: entityName,
        banking_group_id: groupId,
        banking_group_name: groupName,
        scheme_id: selectedScheme,
        scheme_code: scheme?.code || null,
        scheme_name: scheme?.name || null,
        indirect_participation_offered: offered,
        sponsor_is_direct_participant: directParticipant,
        notes: indNotes || null,
        source: indSource || null,
        confidence: indConfidence,
        ai_generated: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cb-indirect/${groupId}`] });
      toast({ title: "Saved", description: "Indirect participation updated" });
      setAdding(false);
      setSelectedScheme("");
      setOffered("unknown");
      setDirectParticipant(false);
      setIndNotes("");
      setIndSource("");
      setIndConfidence("medium");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/cb-indirect/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cb-indirect/${groupId}`] });
      toast({ title: "Deleted" });
    },
  });

  const usedSchemeIds = new Set(entityRecords.map(r => r.scheme_id));
  const availableSchemes = schemes.filter(s => !usedSchemeIds.has(s.id));

  return (
    <div className="mt-3 pt-3 border-t border-slate-100" data-testid={`indirect-section-${entityId}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Network className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs font-medium text-slate-700">Indirect Participation</span>
        </div>
        {availableSchemes.length > 0 && (
          <button
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            onClick={() => setAdding(true)}
            data-testid={`add-indirect-${entityId}`}
          >
            <Plus className="w-3 h-3" /> Add scheme
          </button>
        )}
      </div>

      {entityRecords.length === 0 && !adding && (
        <p className="text-xs text-slate-400">No indirect participation records.</p>
      )}

      {entityRecords.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left py-1 pr-3 font-medium">Scheme</th>
                <th className="text-left py-1 pr-3 font-medium">Market</th>
                <th className="text-center py-1 pr-3 font-medium">Offered</th>
                <th className="text-center py-1 pr-3 font-medium">Direct Participant</th>
                <th className="text-left py-1 font-medium">Notes</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {entityRecords.map(rec => (
                <tr key={rec.id} className="border-b border-slate-50" data-testid={`indirect-row-${rec.id}`}>
                  <td className="py-1.5 pr-3 font-medium text-slate-700">{rec.scheme_name || rec.scheme_code}</td>
                  <td className="py-1.5 pr-3 text-slate-500">
                    {schemes.find(s => s.id === rec.scheme_id)?.market || "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-center">
                    {rec.indirect_participation_offered === "yes"
                      ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Yes</Badge>
                      : rec.indirect_participation_offered === "no"
                      ? <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">No</Badge>
                      : <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs">Unknown</Badge>}
                  </td>
                  <td className="py-1.5 pr-3 text-center">
                    {rec.sponsor_is_direct_participant
                      ? <Shield className="w-3.5 h-3.5 text-emerald-600 mx-auto" />
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-1.5 text-slate-500 truncate max-w-[120px]">{rec.notes || "—"}</td>
                  <td className="py-1.5">
                    <button
                      onClick={() => deleteMutation.mutate(rec.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                      data-testid={`delete-indirect-${rec.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <Dialog open onOpenChange={open => { if (!open) setAdding(false); }}>
          <DialogContent className="max-w-sm" data-testid="add-indirect-dialog">
            <DialogHeader>
              <DialogTitle className="text-sm">Add Indirect Participation</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-xs text-slate-500">For <span className="font-medium text-slate-700">{entityName}</span></p>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Scheme</label>
                <Select value={selectedScheme} onValueChange={setSelectedScheme}>
                  <SelectTrigger data-testid="indirect-scheme-select" className="text-sm">
                    <SelectValue placeholder="Select scheme..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSchemes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.scheme_currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Offered?</label>
                <div className="flex gap-2">
                  {["yes", "no", "unknown"].map(v => (
                    <button
                      key={v}
                      data-testid={`indirect-offered-${v}`}
                      onClick={() => setOffered(v)}
                      className={`flex-1 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        offered === v
                          ? v === "yes" ? "bg-emerald-500 border-emerald-500 text-white"
                            : v === "no" ? "bg-red-500 border-red-500 text-white"
                            : "bg-slate-500 border-slate-500 text-white"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={directParticipant}
                  onChange={e => setDirectParticipant(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  data-testid="indirect-direct-participant"
                />
                Sponsor is direct participant
              </label>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Confidence</label>
                <Select value={indConfidence} onValueChange={setIndConfidence}>
                  <SelectTrigger data-testid="indirect-confidence" className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Source</label>
                <Input
                  value={indSource}
                  onChange={e => setIndSource(e.target.value)}
                  placeholder="e.g. EPC register"
                  data-testid="indirect-source"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Notes</label>
                <Textarea
                  value={indNotes}
                  onChange={e => setIndNotes(e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                  data-testid="indirect-notes"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!selectedScheme || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                data-testid="indirect-save"
              >
                {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface CbProfileProps {
  groupId: string;
  groupName: string;
  entities: LegalEntity[];
  services: CorrespondentService[];
}

export default function CbProfile({ groupId, groupName, entities, services }: CbProfileProps) {
  const { data: taxonomy = {} as TaxonomyGrouped } = useQuery<TaxonomyGrouped>({ queryKey: ["/api/cb-taxonomy"] });
  const { data: capabilities = [], isLoading } = useQuery<CbCapabilityValue[]>({
    queryKey: [`/api/cb-capabilities/${groupId}`],
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-8 py-4 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading CB Profile...
      </div>
    );
  }

  const groupCaps = capabilities.filter(c => !c.legal_entity_id && !c.correspondent_service_id);
  const filledGroupCaps = groupCaps.filter(c => getCapValue(c) !== "unknown").length;
  const totalGroupItems = GROUP_CATEGORIES.reduce((sum, cat) => sum + (taxonomy[cat]?.length || 0), 0);

  return (
    <div className="px-8 py-4 bg-gradient-to-b from-slate-50/50 to-white border-t border-slate-100" data-testid={`cb-profile-${groupId}`}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-slate-800">CB Profile</span>
        <span className="text-xs text-slate-400">{filledGroupCaps}/{totalGroupItems} fields populated</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {GROUP_CATEGORIES.map(cat => {
          const items = taxonomy[cat];
          if (!items || items.length === 0) return null;
          return (
            <CategoryPanel
              key={cat}
              category={cat}
              items={items}
              capabilities={capabilities}
              groupId={groupId}
            />
          );
        })}
      </div>
    </div>
  );
}

export { type TaxonomyGrouped };
