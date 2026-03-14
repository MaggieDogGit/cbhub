import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Swords, Building2, ChevronDown, ChevronRight, Download, Search,
  Globe, Filter, FileSpreadsheet,
  MapPin, Zap, CheckCircle2, XCircle, Users,
} from "lucide-react";
import * as XLSX from "xlsx";
import type {
  BankingGroup, LegalEntity, Bic, CorrespondentService, Fmi, IntelObservation,
} from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────────

interface CompetitorRow {
  group: BankingGroup;
  isCompetitor: boolean;
  entities: LegalEntity[];
  currencies: string[];
  onshoreCount: number;
  offshoreCount: number;
  serviceTypes: string[];
  countries: string[];
  rtgsSystems: string[];
  clsMember: boolean;
  instantPayments: boolean;
  allServices: CorrespondentService[];
  allFmis: Fmi[];
  intelObs: IntelObservation[];
  lastVerified: string | null;
}

const CB_PROB_COLORS: Record<string, string> = {
  High:        "bg-emerald-100 text-emerald-700 border-emerald-200",
  Medium:      "bg-amber-100 text-amber-700 border-amber-200",
  Low:         "bg-rose-100 text-rose-700 border-rose-200",
  Unconfirmed: "bg-slate-100 text-slate-500 border-slate-200",
};

const GSIB_COLORS: Record<string, string> = {
  "G-SIB": "bg-purple-100 text-purple-700 border-purple-200",
  "D-SIB": "bg-blue-100 text-blue-600 border-blue-200",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Bool({ val }: { val: boolean }) {
  return val
    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
    : <XCircle className="w-3.5 h-3.5 text-slate-300 shrink-0" />;
}

function CcyList({ currencies, max = 6 }: { currencies: string[]; max?: number }) {
  const shown = currencies.slice(0, max);
  const rest = currencies.length - max;
  return (
    <div className="flex flex-wrap gap-0.5">
      {shown.map(c => (
        <span key={c} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
          {c}
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
          +{rest}
        </span>
      )}
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

function buildExportRows(rows: CompetitorRow[], mode: "executive" | "analyst") {
  if (mode === "executive") {
    return rows.map(r => ({
      "Group":              r.group.group_name,
      "HQ Country":         r.group.headquarters_country ?? "",
      "G-SIB Status":       r.group.gsib_status ?? "N/A",
      "CB Probability":     r.group.cb_probability ?? "",
      "Competitor":         r.isCompetitor ? "Yes" : "No",
      "Legal Entities":     r.entities.length,
      "Countries":          r.countries.join(", "),
      "Key Currencies":     r.currencies.slice(0, 8).join(", "),
      "Currency Count":     r.currencies.length,
      "Market Coverage":    r.countries.length,
      "Primary Currency":   r.group.primary_currency ?? "",
      "RTGS Member":        r.group.rtgs_member ? "Yes" : "No",
    }));
  }
  return rows.map(r => ({
    "Group":              r.group.group_name,
    "HQ Country":         r.group.headquarters_country ?? "",
    "Primary Currency":   r.group.primary_currency ?? "",
    "G-SIB Status":       r.group.gsib_status ?? "N/A",
    "CB Probability":     r.group.cb_probability ?? "",
    "CB Evidence":        r.group.cb_evidence ?? "",
    "Competitor":         r.isCompetitor ? "Yes" : "No",
    "Intel Count":        r.intelObs.length,
    "Legal Entities":     r.entities.length,
    "Countries":          r.countries.join(", "),
    "All Currencies":     r.currencies.join(", "),
    "Currency Count":     r.currencies.length,
    "Onshore Services":   r.onshoreCount,
    "Offshore Services":  r.offshoreCount,
    "Service Types":      r.serviceTypes.join(", "),
    "RTGS Systems":       r.rtgsSystems.join(", "),
    "CLS Member":         r.clsMember ? "Yes" : "No",
    "Instant Payments":   r.instantPayments ? "Yes" : "No",
    "Last Verified":      r.lastVerified ?? "",
    "Notes":              r.group.notes ?? "",
  }));
}

function exportCSV(rows: CompetitorRow[], mode: "executive" | "analyst") {
  const data = buildExportRows(rows, mode);
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const lines = [
    headers.join(","),
    ...data.map(row =>
      headers.map(h => {
        const v = String((row as Record<string,unknown>)[h] ?? "");
        return v.includes(",") || v.includes('"') || v.includes("\n")
          ? `"${v.replace(/"/g, '""')}"`
          : v;
      }).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `competition-${mode}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(rows: CompetitorRow[], mode: "executive" | "analyst") {
  const data = buildExportRows(rows, mode);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, mode === "executive" ? "Executive View" : "Analyst View");

  // Auto column widths
  const colWidths = Object.keys(data[0] ?? {}).map(k => ({
    wch: Math.min(40, Math.max(k.length + 2, ...data.map(r => String((r as Record<string,unknown>)[k] ?? "").length))),
  }));
  ws["!cols"] = colWidths;

  XLSX.writeFile(wb, `competition-${mode}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Drill-down panel ──────────────────────────────────────────────────────────

function DrillDown({ row }: { row: CompetitorRow }) {
  const { group, entities, allServices, allFmis, intelObs } = row;

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-4 py-4 space-y-4">
      {/* Group meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {[
          { label: "CB Probability", value: group.cb_probability ?? "—" },
          { label: "RTGS System", value: group.rtgs_system ?? "—" },
          { label: "Primary Currency", value: group.primary_currency ?? "—" },
          { label: "Website", value: group.website ? (
            <a href={group.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">
              {group.website.replace(/^https?:\/\//, "")}
            </a>
          ) : "—" },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-lg border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{item.label}</p>
            <div className="text-slate-800 font-medium">{item.value}</div>
          </div>
        ))}
      </div>

      {group.cb_evidence && (
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-500 mr-1">CB Evidence:</span>{group.cb_evidence}
        </div>
      )}

      {/* Intel observations */}
      {intelObs.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Intel Observations ({intelObs.length})
          </p>
          <div className="space-y-1">
            {intelObs.slice(0, 5).map(obs => (
              <div key={obs.id} className="bg-white border border-slate-200 rounded px-3 py-2 text-xs flex gap-3">
                <Badge variant="outline" className={`text-[10px] shrink-0 ${obs.obs_type === "competitor" ? "border-violet-200 text-violet-700 bg-violet-50" : "border-emerald-200 text-emerald-700 bg-emerald-50"}`}>
                  {obs.obs_type === "competitor" ? "Competitor" : "CB Provider"}
                </Badge>
                {obs.currency && <span className="text-amber-700 font-medium shrink-0">{obs.currency}</span>}
                <span className="text-slate-600 flex-1">{obs.notes ?? "—"}</span>
                <span className="text-slate-400 shrink-0">{obs.created_at ? new Date(obs.created_at).toLocaleDateString() : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legal entities */}
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Legal Entities ({entities.length})
        </p>
        <div className="space-y-2">
          {entities.map(entity => {
            const entityFmis = allFmis.filter(f => f.legal_entity_id === entity.id);
            const entityServices = allServices.filter(s => s.legal_entity_name === entity.legal_name || s.country === entity.country);
            const entityCurrencies = [...new Set(entityServices.map(s => s.currency).filter(Boolean))].sort() as string[];
            const entityRtgs = entityFmis.filter(f => f.fmi_type === "Payment Systems").map(f => f.fmi_name).filter(Boolean) as string[];
            const entityCls = entityFmis.some(f => f.fmi_type === "FX Settlement Systems" && f.fmi_name?.includes("CLS"));

            return (
              <div key={entity.id} className="bg-white border border-slate-200 rounded-lg p-3" data-testid={`drilldown-entity-${entity.id}`}>
                <div className="flex flex-wrap items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{entity.legal_name}</p>
                    <p className="text-xs text-slate-500">
                      {entity.country}{entity.entity_type ? ` · ${entity.entity_type}` : ""}
                      {entity.regulator ? ` · Regulated by ${entity.regulator}` : ""}
                    </p>
                  </div>
                  {entity.entity_type && (
                    <Badge variant="outline" className="text-[10px] shrink-0">{entity.entity_type}</Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 text-xs">
                  {entityCurrencies.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-400 mb-1">Currencies</p>
                      <CcyList currencies={entityCurrencies} max={8} />
                    </div>
                  )}
                  {entityRtgs.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-400 mb-1">RTGS</p>
                      <div className="flex flex-wrap gap-0.5">
                        {entityRtgs.map(r => (
                          <span key={r} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {entityCls && (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] text-emerald-700 font-medium">CLS Member</span>
                    </div>
                  )}
                  {entityFmis.filter(f => f.fmi_type === "Instant Payment Systems").length > 0 && (
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      <span className="text-[10px] text-amber-700 font-medium">Instant Payments</span>
                    </div>
                  )}
                </div>

                {entity.notes && (
                  <p className="text-[10px] text-slate-400 mt-2 italic">{entity.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Competition() {
  const { data: groups = [],   isLoading: lg } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: entities = [], isLoading: le } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: bics = [],     isLoading: lb } = useQuery<Bic[]>({ queryKey: ["/api/bics"] });
  const { data: services = [], isLoading: ls } = useQuery<CorrespondentService[]>({ queryKey: ["/api/correspondent-services"] });
  const { data: fmis = [],     isLoading: lf } = useQuery<Fmi[]>({ queryKey: ["/api/fmis"] });
  const { data: intel = [],    isLoading: li } = useQuery<IntelObservation[]>({ queryKey: ["/api/intel"] });

  const isLoading = lg || le || lb || ls || lf || li;

  // View & filter state
  const [view, setView]                   = useState<"executive" | "analyst">("executive");
  const [search, setSearch]               = useState("");
  const [filterShow, setFilterShow]       = useState<"competitors" | "all">("competitors");
  const [filterCurrency, setFilterCurrency]   = useState("all");
  const [filterSvcType, setFilterSvcType]     = useState("all");
  const [filterHq, setFilterHq]               = useState("all");
  const [filterCbProb, setFilterCbProb]       = useState("all");
  const [filterGsib, setFilterGsib]           = useState("all");
  const [expandedId, setExpandedId]           = useState<string | null>(null);

  // ── Build competitor rows ───────────────────────────────────────────────────
  const competitorGroupIds = useMemo(() => {
    return new Set(
      intel.filter(o => o.obs_type === "competitor").map(o => o.banking_group_id).filter(Boolean)
    );
  }, [intel]);

  const rows = useMemo<CompetitorRow[]>(() => {
    const bicMap = new Map<string, Bic[]>();
    bics.forEach(b => {
      const arr = bicMap.get(b.legal_entity_id) ?? [];
      arr.push(b);
      bicMap.set(b.legal_entity_id, arr);
    });

    const svcByBic = new Map<string, CorrespondentService[]>();
    services.forEach(s => {
      const arr = svcByBic.get(s.bic_id) ?? [];
      arr.push(s);
      svcByBic.set(s.bic_id, arr);
    });

    const fmiByEntity = new Map<string, Fmi[]>();
    fmis.forEach(f => {
      const arr = fmiByEntity.get(f.legal_entity_id) ?? [];
      arr.push(f);
      fmiByEntity.set(f.legal_entity_id, arr);
    });

    const intelByGroup = new Map<string, IntelObservation[]>();
    intel.forEach(o => {
      const arr = intelByGroup.get(o.banking_group_id) ?? [];
      arr.push(o);
      intelByGroup.set(o.banking_group_id, arr);
    });

    const entityByGroup = new Map<string, LegalEntity[]>();
    entities.forEach(e => {
      const arr = entityByGroup.get(e.group_id) ?? [];
      arr.push(e);
      entityByGroup.set(e.group_id, arr);
    });

    return groups.map(group => {
      const groupEntities = entityByGroup.get(group.id) ?? [];
      const entityIds = new Set(groupEntities.map(e => e.id));

      // Collect all BICs for these entities
      const groupBics: Bic[] = [];
      entityIds.forEach(eid => (bicMap.get(eid) ?? []).forEach(b => groupBics.push(b)));
      const bicIds = new Set(groupBics.map(b => b.id));

      // Collect all services via BICs
      const allSvcs: CorrespondentService[] = [];
      bicIds.forEach(bid => (svcByBic.get(bid) ?? []).forEach(s => allSvcs.push(s)));

      // Collect all FMIs via entities
      const allFmiList: Fmi[] = [];
      entityIds.forEach(eid => (fmiByEntity.get(eid) ?? []).forEach(f => allFmiList.push(f)));

      // Aggregate
      const currencies = [...new Set(allSvcs.map(s => s.currency).filter(Boolean))].sort() as string[];
      const serviceTypes = [...new Set(allSvcs.map(s => s.service_type).filter(Boolean))].sort() as string[];
      const countries = [...new Set(groupEntities.map(e => e.country).filter(Boolean))].sort() as string[];
      const rtgsSystems = [...new Set(
        allFmiList.filter(f => f.fmi_type === "Payment Systems").map(f => f.fmi_name).filter(Boolean)
      )].sort() as string[];
      const onshoreCount = allSvcs.filter(s => s.clearing_model === "Onshore").length;
      const offshoreCount = allSvcs.filter(s => s.clearing_model === "Offshore").length;
      const clsMember = allFmiList.some(f => f.fmi_type === "FX Settlement Systems" && f.fmi_name?.includes("CLS"));
      const instantPayments = allSvcs.some(s => s.instant_scheme_access) || allFmiList.some(f => f.fmi_type === "Instant Payment Systems");

      // Last verified across services
      const verifiedDates = allSvcs.map(s => s.last_verified).filter(Boolean) as string[];
      const lastVerified = verifiedDates.sort().at(-1) ?? null;

      return {
        group,
        isCompetitor: competitorGroupIds.has(group.id),
        entities: groupEntities,
        currencies,
        serviceTypes,
        countries,
        rtgsSystems,
        onshoreCount,
        offshoreCount,
        clsMember,
        instantPayments,
        allServices: allSvcs,
        allFmis: allFmiList,
        intelObs: intelByGroup.get(group.id) ?? [],
        lastVerified,
      };
    });
  }, [groups, entities, bics, services, fmis, intel, competitorGroupIds]);

  // ── Filter rows ─────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (filterShow === "competitors" && !r.isCompetitor) return false;
      if (search && !r.group.group_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCurrency !== "all" && !r.currencies.includes(filterCurrency)) return false;
      if (filterSvcType !== "all" && !r.serviceTypes.includes(filterSvcType)) return false;
      if (filterHq !== "all" && r.group.headquarters_country !== filterHq) return false;
      if (filterCbProb !== "all" && r.group.cb_probability !== filterCbProb) return false;
      if (filterGsib !== "all" && r.group.gsib_status !== filterGsib) return false;
      return true;
    });
  }, [rows, filterShow, search, filterCurrency, filterSvcType, filterHq, filterCbProb, filterGsib]);

  // ── Dropdown options ────────────────────────────────────────────────────────
  const allCurrencies = useMemo(() => [...new Set(rows.flatMap(r => r.currencies))].sort(), [rows]);
  const allSvcTypes   = useMemo(() => [...new Set(rows.flatMap(r => r.serviceTypes))].sort(), [rows]);
  const allHqCountries = useMemo(() => [...new Set(rows.map(r => r.group.headquarters_country).filter(Boolean))].sort() as string[], [rows]);

  // ── Toggle expand ───────────────────────────────────────────────────────────
  const toggle = (id: string) => setExpandedId(p => p === id ? null : id);

  const competitorCount = rows.filter(r => r.isCompetitor).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-competition">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Swords className="w-5 h-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-competition-title">
              Competition
            </h1>
            <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs">
              {competitorCount} competitor{competitorCount !== 1 ? "s" : ""} tagged
            </Badge>
          </div>
          <p className="text-slate-500 text-sm">Peer benchmarking — aggregated from legal-entity data</p>
        </div>

        {/* View toggle + export */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white text-sm">
            <button
              onClick={() => setView("executive")}
              data-testid="toggle-view-executive"
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "executive" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Executive
            </button>
            <button
              onClick={() => setView("analyst")}
              data-testid="toggle-view-analyst"
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "analyst" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Analyst
            </button>
          </div>
          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8" onClick={() => exportCSV(filteredRows, view)} data-testid="button-export-csv">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8" onClick={() => exportExcel(filteredRows, view)} data-testid="button-export-excel">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />

            {/* Show toggle */}
            <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs">
              <button
                onClick={() => setFilterShow("competitors")}
                data-testid="filter-show-competitors"
                className={`px-2.5 py-1.5 font-medium transition-colors ${filterShow === "competitors" ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <span className="flex items-center gap-1"><Swords className="w-3 h-3" /> Competitors only</span>
              </button>
              <button
                onClick={() => setFilterShow("all")}
                data-testid="filter-show-all"
                className={`px-2.5 py-1.5 font-medium transition-colors ${filterShow === "all" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                All groups
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <Input
                placeholder="Search groups…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-6 h-7 text-xs w-40"
                data-testid="input-competition-search"
              />
            </div>

            {/* Currency filter */}
            <Select value={filterCurrency} onValueChange={setFilterCurrency}>
              <SelectTrigger className="h-7 text-xs w-28" data-testid="filter-currency">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All currencies</SelectItem>
                {allCurrencies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Service type filter */}
            <Select value={filterSvcType} onValueChange={setFilterSvcType}>
              <SelectTrigger className="h-7 text-xs w-44" data-testid="filter-service-type">
                <SelectValue placeholder="Service type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All service types</SelectItem>
                {allSvcTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* HQ country */}
            <Select value={filterHq} onValueChange={setFilterHq}>
              <SelectTrigger className="h-7 text-xs w-36" data-testid="filter-hq-country">
                <SelectValue placeholder="HQ country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {allHqCountries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* CB Probability */}
            <Select value={filterCbProb} onValueChange={setFilterCbProb}>
              <SelectTrigger className="h-7 text-xs w-36" data-testid="filter-cb-prob">
                <SelectValue placeholder="CB probability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All probabilities</SelectItem>
                {["High","Medium","Low","Unconfirmed"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* G-SIB */}
            <Select value={filterGsib} onValueChange={setFilterGsib}>
              <SelectTrigger className="h-7 text-xs w-28" data-testid="filter-gsib">
                <SelectValue placeholder="G-SIB" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All SIB</SelectItem>
                <SelectItem value="G-SIB">G-SIB</SelectItem>
                <SelectItem value="D-SIB">D-SIB</SelectItem>
                <SelectItem value="N/A">N/A</SelectItem>
              </SelectContent>
            </Select>

            {/* Reset */}
            {(filterCurrency !== "all" || filterSvcType !== "all" || filterHq !== "all" || filterCbProb !== "all" || filterGsib !== "all" || search) && (
              <button
                onClick={() => { setFilterCurrency("all"); setFilterSvcType("all"); setFilterHq("all"); setFilterCbProb("all"); setFilterGsib("all"); setSearch(""); }}
                className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                data-testid="button-reset-filters"
              >
                Reset
              </button>
            )}

            <span className="ml-auto text-xs text-slate-400 shrink-0">{filteredRows.length} group{filteredRows.length !== 1 ? "s" : ""}</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {filteredRows.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <Swords className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No groups match your filters</p>
            <p className="text-slate-400 text-xs mt-1">
              {filterShow === "competitors"
                ? "No competitor-tagged groups found. Tag groups via Intel observations in Banking Groups."
                : "Try adjusting your search or filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="competition-table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-8" />
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[200px]">Group</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Entities</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Countries</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[180px]">Key Currencies</th>
                  {view === "analyst" && <>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Onshore</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Offshore</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[140px]">RTGS</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">CLS</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Instant</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Verified</th>
                  </>}
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">CB Prob</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map(row => {
                  const { group, isCompetitor, entities, currencies, countries, rtgsSystems, clsMember, instantPayments, onshoreCount, offshoreCount, lastVerified } = row;
                  const isExpanded = expandedId === group.id;
                  return (
                    <Fragment key={group.id}>
                      <tr
                        onClick={() => toggle(group.id)}
                        className={`cursor-pointer transition-colors ${isExpanded ? "bg-slate-50" : "hover:bg-slate-50"}`}
                        data-testid={`competition-row-${group.id}`}
                      >
                        {/* Expand chevron */}
                        <td className="px-4 py-3 text-slate-400">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />
                          }
                        </td>

                        {/* Group name */}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{group.group_name}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Globe className="w-3 h-3" />
                            {group.headquarters_country ?? "—"}
                            {group.primary_currency && <span className="ml-1 text-slate-400">· {group.primary_currency}</span>}
                          </div>
                        </td>

                        {/* Status badges */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {isCompetitor && (
                              <Badge variant="outline" className="text-[10px] w-fit border-violet-200 text-violet-700 bg-violet-50 gap-1">
                                <Swords className="w-2.5 h-2.5" /> Competitor
                              </Badge>
                            )}
                            {group.gsib_status && group.gsib_status !== "N/A" && (
                              <Badge variant="outline" className={`text-[10px] w-fit ${GSIB_COLORS[group.gsib_status] ?? ""}`}>
                                {group.gsib_status}
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Entity count */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-medium text-slate-700">{entities.length}</span>
                          </div>
                        </td>

                        {/* Countries */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-medium text-slate-700">{countries.length}</span>
                          </div>
                          {view === "analyst" && countries.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{countries.slice(0, 3).join(", ")}{countries.length > 3 ? `…` : ""}</p>
                          )}
                        </td>

                        {/* Key currencies */}
                        <td className="px-4 py-3">
                          {currencies.length === 0
                            ? <span className="text-slate-300 text-xs">—</span>
                            : <CcyList currencies={currencies} max={view === "analyst" ? 10 : 5} />
                          }
                        </td>

                        {/* Analyst-only columns */}
                        {view === "analyst" && <>
                          <td className="px-4 py-3 text-xs text-slate-700 font-medium">{onshoreCount || "—"}</td>
                          <td className="px-4 py-3 text-xs text-slate-700 font-medium">{offshoreCount || "—"}</td>
                          <td className="px-4 py-3">
                            {rtgsSystems.length > 0
                              ? <div className="flex flex-wrap gap-0.5">{rtgsSystems.slice(0, 3).map(r => <span key={r} className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">{r}</span>)}{rtgsSystems.length > 3 && <span className="text-[10px] text-slate-400">+{rtgsSystems.length - 3}</span>}</div>
                              : <span className="text-slate-300 text-xs">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-center"><Bool val={clsMember} /></td>
                          <td className="px-4 py-3 text-center"><Bool val={instantPayments} /></td>
                          <td className="px-4 py-3 text-xs text-slate-500">{lastVerified ? new Date(lastVerified).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"2-digit" }) : "—"}</td>
                        </>}

                        {/* CB Probability */}
                        <td className="px-4 py-3">
                          {group.cb_probability
                            ? <Badge variant="outline" className={`text-[10px] ${CB_PROB_COLORS[group.cb_probability] ?? "border-slate-200 text-slate-500"}`}>{group.cb_probability}</Badge>
                            : <span className="text-slate-300 text-xs">—</span>
                          }
                        </td>
                      </tr>

                      {/* Drill-down */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={view === "analyst" ? 13 : 7} className="p-0">
                            <DrillDown row={row} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Summary footer */}
      {filteredRows.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1">
          {[
            { label: "Groups shown", value: filteredRows.length },
            { label: "Total legal entities", value: filteredRows.reduce((n, r) => n + r.entities.length, 0) },
            { label: "Unique currencies", value: [...new Set(filteredRows.flatMap(r => r.currencies))].length },
            { label: "Countries covered", value: [...new Set(filteredRows.flatMap(r => r.countries))].length },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-700">{s.value}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
