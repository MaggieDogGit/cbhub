import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Coins, Map, Search, ChevronDown, ChevronRight } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CountryRow {
  id: string;
  name: string;
  iso2: string;
  iso3: string;
  numeric_code: number | null;
  official_name: string;
  capital: string | null;
  region_hint: string | null;
  currencies: Array<{ code: string; name: string; symbol: string; is_primary: boolean }> | null;
}

interface CurrencyRow {
  id: string;
  code: string;
  name: string;
  symbol: string;
  minor_units: number;
  country_count: number;
  has_currency_area: boolean;
}

interface RegionRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  member_count: number;
}

// ── Region type colours ────────────────────────────────────────────────────────
const REGION_TYPE_COLOR: Record<string, string> = {
  economic_union: "bg-blue-100 text-blue-800",
  currency_union: "bg-emerald-100 text-emerald-800",
  payment_scheme_region: "bg-violet-100 text-violet-800",
  regulatory_region: "bg-amber-100 text-amber-800",
  geographic_region: "bg-slate-100 text-slate-700",
};
const REGION_TYPE_LABEL: Record<string, string> = {
  economic_union: "Economic Union",
  currency_union: "Currency Union",
  payment_scheme_region: "Payment Scheme",
  regulatory_region: "Regulatory",
  geographic_region: "Geographic",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const flag = (iso2: string) => {
  const codePoints = [...iso2.toUpperCase()].map(c => 0x1f1e5 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// ── Countries Tab ──────────────────────────────────────────────────────────────
function CountriesTab() {
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: countries = [], isLoading } = useQuery<CountryRow[]>({
    queryKey: ["/api/countries"],
  });

  const regions = ["All", ...Array.from(new Set(countries.map(c => c.region_hint).filter(Boolean) as string[])).sort()];

  const filtered = countries.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.iso2.toLowerCase().includes(q) || c.iso3?.toLowerCase().includes(q);
    const matchR = regionFilter === "All" || c.region_hint === regionFilter;
    return matchQ && matchR;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search countries…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-country-search"
          />
        </div>
        <Select value={regionFilter} onValueChange={setRegionFilter}>
          <SelectTrigger className="w-44" data-testid="select-region-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="secondary" data-testid="badge-country-count">{filtered.length} countries</Badge>
      </div>

      {isLoading ? (
        <div className="text-slate-400 text-sm py-8 text-center">Loading countries…</div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 w-8"></th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600">Country</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">ISO2</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">ISO3</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Capital</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Region</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Currencies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(c => (
                <Fragment key={c.id}>
                  <tr
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    data-testid={`row-country-${c.iso2}`}
                  >
                    <td className="px-4 py-2.5 text-slate-400">
                      {expanded === c.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      <span className="mr-2 text-base" aria-hidden="true">{flag(c.iso2)}</span>
                      {c.name}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700">{c.iso2}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{c.iso3}</td>
                    <td className="px-3 py-2.5 text-slate-600">{c.capital ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {c.region_hint && (
                        <Badge variant="outline" className="text-xs">{c.region_hint}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {(c.currencies ?? []).map(cur => (
                          <Badge
                            key={cur.code}
                            className={`text-xs ${cur.is_primary ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-slate-100 text-slate-600"}`}
                            variant="outline"
                          >
                            {cur.code}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-8 py-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Official Name</div>
                            <div className="text-slate-700">{c.official_name}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Numeric Code (ISO 3166)</div>
                            <div className="text-slate-700">{c.numeric_code ?? "—"}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Currencies</div>
                            <div className="flex gap-2 flex-wrap">
                              {(c.currencies ?? []).map(cur => (
                                <span key={cur.code} className="text-slate-700">
                                  {cur.symbol} {cur.code} — {cur.name}{cur.is_primary ? " (primary)" : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Currencies Tab ─────────────────────────────────────────────────────────────
function CurrenciesTab() {
  const [search, setSearch] = useState("");

  const { data: currencies = [], isLoading } = useQuery<CurrencyRow[]>({
    queryKey: ["/api/currencies"],
  });

  const filtered = currencies.filter(c => {
    const q = search.toLowerCase();
    return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search currencies…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-currency-search"
          />
        </div>
        <Badge variant="secondary" data-testid="badge-currency-count">{filtered.length} currencies</Badge>
      </div>

      {isLoading ? (
        <div className="text-slate-400 text-sm py-8 text-center">Loading currencies…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(cur => (
            <Card key={cur.id} className="border-slate-200 hover:border-slate-300 transition-colors" data-testid={`card-currency-${cur.code}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono font-bold text-slate-900 text-lg">{cur.code}</span>
                      <span className="text-slate-400 text-sm">{cur.symbol}</span>
                    </div>
                    <div className="text-slate-600 text-sm mt-0.5">{cur.name}</div>
                  </div>
                  {cur.has_currency_area && (
                    <Badge className="bg-violet-100 text-violet-700 text-xs border-violet-200" variant="outline">Area</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                  <span>{cur.minor_units} decimal{cur.minor_units !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{cur.country_count} {cur.country_count === 1 ? "country" : "countries"}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Regions Tab ────────────────────────────────────────────────────────────────
function RegionsTab() {
  const [typeFilter, setTypeFilter] = useState("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: regions = [], isLoading } = useQuery<RegionRow[]>({
    queryKey: ["/api/regions"],
  });

  const types = ["All", ...Array.from(new Set(regions.map(r => r.type))).sort()];
  const filtered = typeFilter === "All" ? regions : regions.filter(r => r.type === typeFilter);

  // Group by type for display
  const grouped = filtered.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, RegionRow[]>);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-52" data-testid="select-type-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map(t => (
              <SelectItem key={t} value={t}>
                {t === "All" ? "All types" : (REGION_TYPE_LABEL[t] ?? t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" data-testid="badge-region-count">{filtered.length} regions</Badge>
      </div>

      {isLoading ? (
        <div className="text-slate-400 text-sm py-8 text-center">Loading regions…</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, rows]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-3">
                <Badge className={`${REGION_TYPE_COLOR[type]} text-xs border-0`}>
                  {REGION_TYPE_LABEL[type] ?? type}
                </Badge>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rows.map(r => (
                  <RegionCard key={r.id} region={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface RegionDetailRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  members: Array<{ iso2: string; iso3: string; name: string; capital: string }> | null;
  currencies: Array<{ code: string; name: string; symbol: string; is_official: boolean }> | null;
}

function RegionCard({ region, expanded, onToggle }: { region: RegionRow; expanded: boolean; onToggle: () => void }) {
  const { data: detail } = useQuery<RegionDetailRow>({
    queryKey: ["/api/regions", region.id],
    queryFn: () => fetch(`/api/regions/${region.id}`).then(r => r.json()),
    enabled: expanded,
  });

  return (
    <Card
      className={`border-slate-200 transition-all ${expanded ? "shadow-sm" : "hover:border-slate-300"}`}
      data-testid={`card-region-${region.id}`}
    >
      <CardHeader
        className="p-4 pb-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900">{region.name}</CardTitle>
            {region.description && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{region.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs">{region.member_count} members</Badge>
            {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </div>
        </div>
      </CardHeader>

      {expanded && detail && (
        <CardContent className="px-4 pb-4 pt-0 border-t border-slate-100">
          {(detail.currencies ?? []).length > 0 && (
            <div className="mb-3 mt-3">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1.5">Currencies</div>
              <div className="flex gap-1.5 flex-wrap">
                {(detail.currencies ?? []).map(c => (
                  <Badge
                    key={c.code}
                    variant="outline"
                    className={`text-xs ${c.is_official ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600"}`}
                  >
                    {c.symbol} {c.code}{c.is_official ? " ✓" : ""}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {(detail.members ?? []).length > 0 && (
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1.5">Members</div>
              <div className="flex gap-1 flex-wrap">
                {(detail.members ?? []).map(m => (
                  <span key={m.iso2} className="inline-flex items-center gap-0.5 text-xs bg-slate-100 text-slate-700 rounded px-1.5 py-0.5">
                    <span aria-hidden="true">{flag(m.iso2)}</span>
                    {m.iso2}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function GeoReference() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Globe className="w-6 h-6 text-slate-500" />
          Geographic & Currency Reference
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Country, currency, and regional classification reference model for correspondent banking analysis
        </p>
      </div>

      <Tabs defaultValue="countries">
        <TabsList data-testid="tabs-geo">
          <TabsTrigger value="countries" data-testid="tab-countries">
            <Globe className="w-4 h-4 mr-1.5" />
            Countries
          </TabsTrigger>
          <TabsTrigger value="currencies" data-testid="tab-currencies">
            <Coins className="w-4 h-4 mr-1.5" />
            Currencies
          </TabsTrigger>
          <TabsTrigger value="regions" data-testid="tab-regions">
            <Map className="w-4 h-4 mr-1.5" />
            Regions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="countries" className="mt-5">
          <CountriesTab />
        </TabsContent>
        <TabsContent value="currencies" className="mt-5">
          <CurrenciesTab />
        </TabsContent>
        <TabsContent value="regions" className="mt-5">
          <RegionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
