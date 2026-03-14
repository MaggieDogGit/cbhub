import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Globe, CreditCard, ShieldCheck, BarChart3, Coins, Eye, ArrowRight, Swords, Briefcase } from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useState, useMemo, useEffect, useCallback } from "react";
import CoverageMap from "@/components/market/CoverageMap";
import type { BankingGroup, LegalEntity, Fmi, CorrespondentService, IntelObservation, Bic, AgentJob } from "@shared/schema";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];

type CurrencyProviderRow = { currency: string; count: number; banks: string[] };
type CoverageMapRow = { country: string; currency: string; group_name: string; rtgs_membership: boolean; instant_scheme_access: boolean; cls_member: boolean };

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const handleResize = useCallback(() => setWidth(window.innerWidth), []);
  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);
  return width;
}

function ToggleStrip({ label, options, value, onChange }: {
  label: string;
  options: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2" data-testid={`toggle-strip-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5 md:gap-2">
        {options.map(opt => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              value === opt.key
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            data-testid={`toggle-${label.toLowerCase().replace(/\s+/g, "-")}-${opt.key}`}
          >
            {opt.label}{opt.count !== undefined ? ` (${opt.count})` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: groups = [], isLoading: loadingGroups } = useQuery<BankingGroup[]>({ queryKey: ["/api/banking-groups"] });
  const { data: entities = [], isLoading: loadingEntities } = useQuery<LegalEntity[]>({ queryKey: ["/api/legal-entities"] });
  const { data: currencyData = [], isLoading: loadingCurrency } = useQuery<CurrencyProviderRow[]>({ queryKey: ["/api/dashboard/currency-providers"] });
  const { data: fmis = [], isLoading: loadingFmis } = useQuery<Fmi[]>({ queryKey: ["/api/fmis"] });
  const { data: coverageMapData = [], isLoading: loadingMap } = useQuery<CoverageMapRow[]>({ queryKey: ["/api/dashboard/coverage-map"] });
  const { data: services = [], isLoading: loadingServices } = useQuery<CorrespondentService[]>({ queryKey: ["/api/correspondent-services"] });
  const { data: bics = [], isLoading: loadingBics } = useQuery<Bic[]>({ queryKey: ["/api/bics"] });
  const { data: intelObs = [], isLoading: loadingIntel } = useQuery<IntelObservation[]>({ queryKey: ["/api/intel"] });
  const { data: jobs = [] } = useQuery<AgentJob[]>({ queryKey: ["/api/jobs"] });

  const [cbProbFilter, setCbProbFilter] = useState("all");
  const [gsibFilter, setGsibFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [showCompetitors, setShowCompetitors] = useState(false);
  const [showMyCb, setShowMyCb] = useState(false);
  const [intelType, setIntelType] = useState<"competitor" | "cb_provider">("competitor");
  const [expandedIntelIds, setExpandedIntelIds] = useState<Set<string>>(new Set());

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 640;

  const loading = loadingGroups || loadingEntities || loadingCurrency || loadingFmis || loadingMap || loadingServices || loadingBics || loadingIntel;

  const hasAnyIntel = intelObs.length > 0;
  const hasIntelFilter = showCompetitors || showMyCb;

  const intelGroupNames = useMemo(() => {
    const names = new Set<string>();
    intelObs.forEach(o => {
      if (showCompetitors && o.obs_type === "competitor") names.add(o.banking_group_name);
      if (showMyCb && o.obs_type === "cb_provider") names.add(o.banking_group_name);
    });
    return names;
  }, [intelObs, showCompetitors, showMyCb]);

  const intelBicIds = useMemo(() => {
    if (!hasIntelFilter) return null;
    const groupIds = new Set(groups.filter(g => intelGroupNames.has(g.group_name)).map(g => g.id));
    const entityIds = new Set(entities.filter(e => groupIds.has(e.group_id)).map(e => e.id));
    return new Set(bics.filter(b => entityIds.has(b.legal_entity_id)).map(b => b.id));
  }, [hasIntelFilter, intelGroupNames, groups, entities, bics]);

  const groupsWithServices = useMemo(() => {
    const svcGroupNames = new Set(services.map(s => s.group_name).filter(Boolean));
    return new Set(groups.filter(g => svcGroupNames.has(g.group_name)).map(g => g.id));
  }, [groups, services]);

  const filteredGroups = useMemo(() => {
    return groups.filter(g => {
      if (cbProbFilter !== "all") {
        if (cbProbFilter === "not_assessed") {
          if (g.cb_probability && ["High","Medium","Low","Unconfirmed"].includes(g.cb_probability)) return false;
        } else {
          if (g.cb_probability !== cbProbFilter) return false;
        }
      }
      if (gsibFilter !== "all") {
        if (gsibFilter === "other") {
          if (g.gsib_status === "G-SIB" || g.gsib_status === "D-SIB") return false;
        } else {
          if (g.gsib_status !== gsibFilter) return false;
        }
      }
      if (providerFilter !== "all") {
        const hasSvc = groupsWithServices.has(g.id);
        if (providerFilter === "has_services" && !hasSvc) return false;
        if (providerFilter === "no_services" && hasSvc) return false;
      }
      if (hasIntelFilter && !intelGroupNames.has(g.group_name)) return false;
      return true;
    });
  }, [groups, cbProbFilter, gsibFilter, providerFilter, groupsWithServices, hasIntelFilter, intelGroupNames]);

  const cbProbCounts = useMemo(() => ({
    high: groups.filter(g => g.cb_probability === "High").length,
    medium: groups.filter(g => g.cb_probability === "Medium").length,
    low: groups.filter(g => g.cb_probability === "Low").length,
    unconfirmed: groups.filter(g => g.cb_probability === "Unconfirmed").length,
    not_assessed: groups.filter(g => !g.cb_probability || !["High","Medium","Low","Unconfirmed"].includes(g.cb_probability)).length,
  }), [groups]);

  const gsibCounts = useMemo(() => ({
    gsib: groups.filter(g => g.gsib_status === "G-SIB").length,
    dsib: groups.filter(g => g.gsib_status === "D-SIB").length,
    other: groups.filter(g => !g.gsib_status || g.gsib_status === "N/A").length,
  }), [groups]);

  const providerCounts = useMemo(() => ({
    has_services: groupsWithServices.size,
    no_services: groups.length - groupsWithServices.size,
  }), [groups, groupsWithServices]);

  const filteredGroupIds = useMemo(() => new Set(filteredGroups.map(g => g.id)), [filteredGroups]);

  const filteredEntities = useMemo(() => {
    return entities.filter(e => filteredGroupIds.has(e.group_id));
  }, [entities, filteredGroupIds]);

  const gsibCount = filteredGroups.filter(g => g.gsib_status === "G-SIB").length;
  const dsibCount = filteredGroups.filter(g => g.gsib_status === "D-SIB").length;
  const naCount = filteredGroups.filter(g => !g.gsib_status || g.gsib_status === "N/A").length;

  const filteredClsMembers = useMemo(() => {
    const filteredEntityIds = new Set(filteredEntities.map(e => e.id));
    return fmis.filter(f => f.fmi_name === "CLS" && filteredEntityIds.has(f.legal_entity_id)).length;
  }, [fmis, filteredEntities]);

  const gsibData = [
    { name: "G-SIB", value: gsibCount },
    { name: "D-SIB", value: dsibCount },
    { name: "N/A", value: naCount },
  ].filter(d => d.value > 0);

  const activeCurrencyData = useMemo(() => {
    if (!hasIntelFilter || !intelBicIds) return currencyData;
    const bicToGroup = new Map<string, string>();
    bics.forEach(b => {
      const entity = entities.find(e => e.id === b.legal_entity_id);
      if (!entity) return;
      const group = groups.find(g => g.id === entity.group_id);
      if (group) bicToGroup.set(b.id, group.group_name);
    });
    const filtered = services.filter(s => s.clearing_model === "Onshore" && s.currency && intelBicIds.has(s.bic_id));
    const byCurrency = new Map<string, Set<string>>();
    filtered.forEach(s => {
      const groupName = bicToGroup.get(s.bic_id) || s.group_name || "Unknown";
      if (!byCurrency.has(s.currency!)) byCurrency.set(s.currency!, new Set());
      byCurrency.get(s.currency!)!.add(groupName);
    });
    return Array.from(byCurrency.entries())
      .map(([currency, banks]) => ({ currency, count: banks.size, banks: Array.from(banks).sort() }))
      .sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
  }, [hasIntelFilter, intelBicIds, currencyData, services, bics, entities, groups]);

  const mapResults = useMemo(() => {
    const data = hasIntelFilter
      ? coverageMapData.filter(r => intelGroupNames.has(r.group_name))
      : coverageMapData;
    return data.map(r => ({
      bankingGroup: r.group_name,
      hqCountry: r.country,
      currency: r.currency,
      rtgs: r.rtgs_membership,
      instant: r.instant_scheme_access,
      cls: r.cls_member,
    }));
  }, [coverageMapData, hasIntelFilter, intelGroupNames]);

  const competitorCount = intelObs.filter(o => o.obs_type === "competitor").length;
  const myCbCount = intelObs.filter(o => o.obs_type === "cb_provider").length;

  const competitorGroupCount = useMemo(() => {
    const ids = new Set(intelObs.filter(o => o.obs_type === "competitor").map(o => o.banking_group_id).filter(Boolean));
    return ids.size;
  }, [intelObs]);

  const recentJobsCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return jobs.filter(j => j.created_at && new Date(j.created_at).getTime() > cutoff).length;
  }, [jobs]);

  const filteredIntel = useMemo(() => {
    return intelObs
      .filter(o => o.obs_type === intelType)
      .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
      .slice(0, 5);
  }, [intelObs, intelType]);

  const renderCustomPieLabel = ({ cx, cy, midAngle, outerRadius, name, value }: {
    cx: number; cy: number; midAngle: number; outerRadius: number; name: string; value: number;
  }) => {
    if (isMobile) return null;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 25;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#475569" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={12} fontWeight={600}>
        {name}: {value}
      </text>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64" data-testid="loading-dashboard">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  const sibTotal = gsibData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-1">Global correspondent banking intelligence overview</p>
      </div>

      {/* Quick navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Competition", desc: "Competitor benchmarking", path: "/competition", icon: Swords, color: "text-violet-600 bg-violet-50 border-violet-100" },
          { label: "Banking Groups", desc: "Provider hierarchy", path: "/banking-groups", icon: Building2, color: "text-blue-600 bg-blue-50 border-blue-100" },
          { label: "Legal Entities", desc: "Licensed entities & services", path: "/legal-entities", icon: CreditCard, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
          { label: "Research", desc: "AI research & jobs", path: "/research", icon: Briefcase, color: "text-amber-600 bg-amber-50 border-amber-100" },
        ].map(nav => (
          <Link key={nav.path} href={nav.path} data-testid={`quicknav-${nav.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border bg-white hover:shadow-sm transition-shadow cursor-pointer group`}>
              <div className={`p-1.5 rounded-lg shrink-0 ${nav.color}`}>
                <nav.icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 leading-tight">{nav.label}</div>
                <div className="text-[10px] text-slate-400 truncate">{nav.desc}</div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 ml-auto shrink-0 transition-colors" />
            </div>
          </Link>
        ))}
      </div>

      <Card className="border-0 shadow-sm" data-testid="card-toggles">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <ToggleStrip
            label="CB Probability"
            options={[
              { key: "all", label: "All" },
              { key: "High", label: "High", count: cbProbCounts.high },
              { key: "Medium", label: "Medium", count: cbProbCounts.medium },
              { key: "Low", label: "Low", count: cbProbCounts.low },
              { key: "Unconfirmed", label: "Unconfirmed", count: cbProbCounts.unconfirmed },
              { key: "not_assessed", label: "Not Assessed", count: cbProbCounts.not_assessed },
            ]}
            value={cbProbFilter}
            onChange={setCbProbFilter}
          />
          <ToggleStrip
            label="G-SIB Status"
            options={[
              { key: "all", label: "All" },
              { key: "G-SIB", label: "G-SIB", count: gsibCounts.gsib },
              { key: "D-SIB", label: "D-SIB", count: gsibCounts.dsib },
              { key: "other", label: "Other", count: gsibCounts.other },
            ]}
            value={gsibFilter}
            onChange={setGsibFilter}
          />
          <ToggleStrip
            label="CB Provider"
            options={[
              { key: "all", label: "All" },
              { key: "has_services", label: "Has Services", count: providerCounts.has_services },
              { key: "no_services", label: "No Services", count: providerCounts.no_services },
            ]}
            value={providerFilter}
            onChange={setProviderFilter}
          />
          {hasAnyIntel && (
            <>
              <div className="border-t border-slate-200" />
              <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2" data-testid="toggle-strip-intel-filter">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1 shrink-0">Intel Filter</span>
                <div className="flex flex-wrap gap-1.5 md:gap-2">
                  <button
                    onClick={() => setShowCompetitors(v => !v)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      showCompetitors
                        ? "bg-violet-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    data-testid="toggle-intel-filter-competitors"
                  >
                    Competitors {showCompetitors && competitorCount > 0 ? `(${competitorCount})` : ""}
                  </button>
                  <button
                    onClick={() => setShowMyCb(v => !v)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      showMyCb
                        ? "bg-violet-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    data-testid="toggle-intel-filter-my-cb"
                  >
                    My CB {showMyCb && myCbCount > 0 ? `(${myCbCount})` : ""}
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: "Banking Groups", value: filteredGroups.length, icon: Building2, color: "text-blue-600 bg-blue-50", link: "/banking-groups" },
          { label: "Competition-tagged", value: competitorGroupCount, icon: Swords, color: "text-violet-600 bg-violet-50", link: "/competition" },
          { label: "Legal Entities", value: filteredEntities.length, icon: CreditCard, color: "text-emerald-600 bg-emerald-50", link: "/legal-entities" },
          { label: "G-SIB Providers", value: gsibCount, icon: ShieldCheck, color: "text-purple-600 bg-purple-50" },
          { label: "Jobs (7 days)", value: recentJobsCount, icon: Briefcase, color: "text-amber-600 bg-amber-50", link: "/research" },
        ].map(stat => (
          <Card key={stat.label} className={`border-0 shadow-sm ${stat.link ? "hover:shadow-md transition-shadow cursor-pointer" : ""}`} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-3 sm:p-5">
              {stat.link ? (
                <Link href={stat.link} className="flex items-center gap-2 sm:gap-3 no-underline">
                  <div className={`p-1.5 sm:p-2 rounded-lg ${stat.color} shrink-0`}>
                    <stat.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-bold text-slate-900">{stat.value}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 leading-tight">{stat.label}</div>
                  </div>
                </Link>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`p-1.5 sm:p-2 rounded-lg ${stat.color} shrink-0`}>
                    <stat.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-bold text-slate-900">{stat.value}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 leading-tight">{stat.label}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Providers per Currency (Onshore)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeCurrencyData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                {hasIntelFilter ? "No onshore services for selected groups" : "No data yet — add providers to see chart"}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <div style={{ width: Math.max(500, activeCurrencyData.length * 52), height: 240 }}>
                  <BarChart
                    width={Math.max(500, activeCurrencyData.length * 52)}
                    height={240}
                    data={activeCurrencyData}
                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                  >
                    <XAxis dataKey="currency" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as CurrencyProviderRow;
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-xs z-50">
                          <p className="font-semibold text-slate-800 mb-2 text-sm">{d.currency} — {d.count} provider{d.count !== 1 ? "s" : ""}</p>
                          <ul className="text-xs text-slate-600 space-y-0.5">
                            {d.banks.map((b: string) => (
                              <li key={b} className="flex items-start gap-1"><span className="text-blue-400 mt-0.5">•</span>{b}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm" data-testid="card-sib-classification">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">SIB Classification</CardTitle>
          </CardHeader>
          <CardContent>
            {gsibData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
            ) : isMobile ? (
              <div className="space-y-3 py-2">
                {gsibData.map((d, i) => (
                  <div key={d.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                        <span className="font-medium text-slate-700">{d.name}</span>
                      </div>
                      <span className="font-bold text-slate-900 tabular-nums">{d.value}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${sibTotal > 0 ? (d.value / sibTotal) * 100 : 0}%`, backgroundColor: COLORS[i] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={gsibData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={renderCustomPieLabel} labelLine>
                    {gsibData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm" data-testid="card-coverage-map">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Globe className="w-4 h-4" /> Onshore Currency Coverage
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">Countries with active onshore correspondent banking services</p>
        </CardHeader>
        <CardContent>
          {mapResults.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              {hasIntelFilter ? "No onshore services for selected groups" : "No onshore services with country data yet"}
            </div>
          ) : (
            <CoverageMap results={mapResults} />
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm" data-testid="card-intel-strip">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Eye className="w-4 h-4" /> Latest Intel
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIntelType("competitor")}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  intelType === "competitor" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                data-testid="toggle-intel-competitor"
              >
                Competitor ({competitorCount})
              </button>
              <button
                onClick={() => setIntelType("cb_provider")}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  intelType === "cb_provider" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                data-testid="toggle-intel-my-cb"
              >
                My CB ({myCbCount})
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredIntel.length === 0 ? (
            <div className="h-20 flex items-center justify-center text-slate-400 text-sm">
              No {intelType === "competitor" ? "competitor" : "My CB"} observations yet
            </div>
          ) : (
            <div className="space-y-2">
              {filteredIntel.map(obs => (
                <div key={obs.id} className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 rounded-lg" data-testid={`intel-row-${obs.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                      <span className="font-semibold text-xs sm:text-sm text-slate-800">{obs.banking_group_name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        obs.source_type === "user" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
                      }`}>
                        {obs.source_type === "user" ? "User" : "AI"}
                      </span>
                      {obs.currency && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
                          {obs.currency}
                        </span>
                      )}
                    </div>
                    {obs.notes && (() => {
                      const isLong = obs.notes!.length > 120;
                      const isExpanded = expandedIntelIds.has(obs.id);
                      return (
                        <div className="text-xs text-slate-600">
                          <p className={isExpanded ? "" : "line-clamp-2"}>{isLong && !isExpanded ? obs.notes!.slice(0, 120) + "..." : obs.notes}</p>
                          {isLong && (
                            <button
                              onClick={() => {
                                const next = new Set(expandedIntelIds);
                                if (isExpanded) next.delete(obs.id); else next.add(obs.id);
                                setExpandedIntelIds(next);
                              }}
                              className="text-blue-600 hover:text-blue-800 text-[10px] font-medium mt-0.5"
                              data-testid={`intel-expand-${obs.id}`}
                            >
                              {isExpanded ? "Show less" : "Read more"}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="text-[10px] text-slate-400 whitespace-nowrap mt-1">
                    {obs.created_at ? new Date(obs.created_at).toLocaleDateString() : ""}
                  </div>
                </div>
              ))}
              <Link href="/competition" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium mt-2" data-testid="link-view-all-intel">
                View competition intel <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
