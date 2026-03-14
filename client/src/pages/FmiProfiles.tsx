import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, ArrowRight, Globe, Building2, LayoutList, Clock, ChevronRight, Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface FmiEntryRow {
  id: string;
  name: string;
  short_name: string | null;
  code: string | null;
  status: string;
  operator_name: string | null;
  functional_role_summary: string | null;
  settlement_model: string | null;
  supports_24x7: boolean | null;
  supports_cross_border: boolean | null;
  primary_currency_code: string | null;
  description: string | null;
  notes: string | null;
  category_code: string;
  category_name: string;
  category_level: number;
  parent_category_code: string | null;
  parent_category_name: string | null;
  domain_code: string;
  domain_name: string;
}

// ── Domain styling ─────────────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  PS:  "bg-blue-100 text-blue-800 border-blue-200",
  FXS: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CPI: "bg-purple-100 text-purple-800 border-purple-200",
  SMI: "bg-amber-100 text-amber-800 border-amber-200",
  CCP: "bg-red-100 text-red-800 border-red-200",
  TR:  "bg-indigo-100 text-indigo-800 border-indigo-200",
};
const DOMAIN_SIDEBAR_ACTIVE: Record<string, string> = {
  PS:  "bg-blue-600 text-white",
  FXS: "bg-emerald-600 text-white",
  CPI: "bg-purple-600 text-white",
  SMI: "bg-amber-600 text-white",
  CCP: "bg-red-600 text-white",
  TR:  "bg-indigo-600 text-white",
};
const STATUS_COLORS: Record<string, string> = {
  live:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  pilot:   "bg-amber-50 text-amber-700 border-amber-200",
  planned: "bg-blue-50 text-blue-700 border-blue-200",
  retired: "bg-slate-100 text-slate-500 border-slate-200",
};

// ── Card component ─────────────────────────────────────────────────────────────
function FmiEntryCard({ entry }: { entry: FmiEntryRow }) {
  const categoryLabel = entry.parent_category_name
    ? `${entry.parent_category_name} › ${entry.category_name}`
    : entry.category_name;

  return (
    <Link href={`/fmis/${entry.id}`}>
      <Card
        className="group h-full border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer bg-white"
        data-testid={`card-fmi-${entry.id}`}
      >
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm leading-snug group-hover:text-blue-700 transition-colors line-clamp-2">
                {entry.name}
              </h3>
              {entry.short_name && (
                <span className="text-xs text-slate-400 font-medium">{entry.short_name}</span>
              )}
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 shrink-0 mt-0.5 transition-colors" />
          </div>

          {/* Domain + Category breadcrumb */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={`text-xs font-medium ${DOMAIN_COLORS[entry.domain_code] ?? ""}`}>
              {entry.domain_name}
            </Badge>
            <Badge variant="outline" className="text-xs text-slate-500 border-slate-200 max-w-[180px] truncate">
              {categoryLabel}
            </Badge>
          </div>

          {/* Currency */}
          {entry.primary_currency_code && (
            <span className="self-start text-xs font-mono font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
              {entry.primary_currency_code}
            </span>
          )}

          {/* Functional role */}
          {entry.functional_role_summary && (
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 flex-1">
              {entry.functional_role_summary}
            </p>
          )}

          {/* Footer row */}
          <div className="flex items-center gap-3 flex-wrap mt-auto pt-2 border-t border-slate-100">
            {entry.operator_name && (
              <div className="flex items-center gap-1 text-xs text-slate-400 min-w-0">
                <Building2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{entry.operator_name}</span>
              </div>
            )}
            <div className="flex gap-1.5 ml-auto shrink-0">
              {entry.supports_24x7 && (
                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50 gap-0.5">
                  <Zap className="w-2.5 h-2.5" />24×7
                </Badge>
              )}
              {entry.status && entry.status !== "live" && (
                <Badge variant="outline" className={`text-xs ${STATUS_COLORS[entry.status] ?? ""}`}>
                  {entry.status}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function FmiCardSkeleton() {
  return (
    <Card className="border border-slate-200">
      <CardContent className="p-5 flex flex-col gap-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-32 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function FmiProfiles() {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery<FmiEntryRow[]>({
    queryKey: ["/api/fmi-entries"],
  });

  // Derive domain list from data
  const domains = Array.from(
    new Map(items.map(i => [i.domain_code, { code: i.domain_code, name: i.domain_name }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Categories available for the selected domain
  const availableCategories = Array.from(
    new Map(
      items
        .filter(i => domainFilter === "all" || i.domain_code === domainFilter)
        .map(i => {
          const key = i.parent_category_code ?? i.category_code;
          const label = i.parent_category_name ?? i.category_name;
          return [key, { code: key, name: label }];
        })
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filtered = items.filter(item => {
    if (domainFilter !== "all" && item.domain_code !== domainFilter) return false;
    if (categoryFilter !== "all") {
      const groupCode = item.parent_category_code ?? item.category_code;
      if (groupCode !== categoryFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.short_name ?? "").toLowerCase().includes(q) ||
        (item.code ?? "").toLowerCase().includes(q) ||
        (item.operator_name ?? "").toLowerCase().includes(q) ||
        (item.category_name ?? "").toLowerCase().includes(q) ||
        (item.domain_name ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const domainCounts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.domain_code] = (acc[i.domain_code] ?? 0) + 1;
    return acc;
  }, {});

  const hasFilters = domainFilter !== "all" || categoryFilter !== "all" || search;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Financial Market Infrastructures</h1>
        <p className="text-slate-500 text-sm mt-1">
          Global FMI taxonomy — {items.length} entries across {domains.length} domains.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left sidebar — domain facets */}
        <div className="w-52 shrink-0 space-y-1" data-testid="sidebar-fmi-domains">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-2 pb-1">Domain</p>
          <button
            onClick={() => { setDomainFilter("all"); setCategoryFilter("all"); }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
              domainFilter === "all" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
            data-testid="filter-domain-all"
          >
            <span>All FMIs</span>
            <span className={`text-xs font-medium ${domainFilter === "all" ? "text-blue-100" : "text-slate-400"}`}>
              {items.length}
            </span>
          </button>
          {domains.map(d => (
            <button
              key={d.code}
              onClick={() => { setDomainFilter(d.code); setCategoryFilter("all"); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                domainFilter === d.code
                  ? (DOMAIN_SIDEBAR_ACTIVE[d.code] ?? "bg-blue-600 text-white")
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              data-testid={`filter-domain-${d.code.toLowerCase()}`}
            >
              <span className="leading-snug truncate">{d.name}</span>
              <span className={`text-xs font-medium shrink-0 ml-1 ${domainFilter === d.code ? "opacity-70" : "text-slate-400"}`}>
                {domainCounts[d.code] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Top filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name, code, operator…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
                data-testid="input-fmi-search"
              />
            </div>
            {availableCategories.length > 1 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-60" data-testid="select-fmi-category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {availableCategories.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {hasFilters && (
              <Button
                variant="outline" size="sm"
                onClick={() => { setDomainFilter("all"); setCategoryFilter("all"); setSearch(""); }}
                data-testid="button-fmi-clear"
              >
                Clear
              </Button>
            )}
            <span className="text-sm text-slate-500 ml-auto">
              {filtered.length} of {items.length}
            </span>
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => <FmiCardSkeleton key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <LayoutList className="w-8 h-8 mb-2 opacity-40" />
              <p>No FMIs match the current filters.</p>
              {hasFilters && (
                <Button variant="link" size="sm" onClick={() => { setDomainFilter("all"); setCategoryFilter("all"); setSearch(""); }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(entry => <FmiEntryCard key={entry.id} entry={entry} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
