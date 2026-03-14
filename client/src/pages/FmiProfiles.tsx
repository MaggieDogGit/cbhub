import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ArrowRight, Globe, Building2, LayoutList } from "lucide-react";
import type { FmiTaxonomy } from "@shared/schema";
import { FMI_TAXONOMY_TYPES } from "@shared/schema";

const TYPE_COLORS: Record<string, string> = {
  "Settlement Systems": "bg-blue-100 text-blue-700 border-blue-200",
  "Clearing Systems": "bg-purple-100 text-purple-700 border-purple-200",
  "Instant Payment Infrastructures": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Reachability and Network Infrastructures": "bg-orange-100 text-orange-700 border-orange-200",
  "Payment Scheme Infrastructures": "bg-pink-100 text-pink-700 border-pink-200",
  "Cross-Border and Interoperability Infrastructures": "bg-indigo-100 text-indigo-700 border-indigo-200",
};

const TYPE_LABELS: Record<string, string> = {
  "Settlement Systems": "Settlement",
  "Clearing Systems": "Clearing",
  "Instant Payment Infrastructures": "Instant Payments",
  "Reachability and Network Infrastructures": "Reachability",
  "Payment Scheme Infrastructures": "Payment Schemes",
  "Cross-Border and Interoperability Infrastructures": "Cross-Border",
};

function FmiCard({ fmi }: { fmi: FmiTaxonomy }) {
  const currencies = fmi.currency_scope
    ? fmi.currency_scope.split(",").map(c => c.trim()).slice(0, 4)
    : fmi.primary_currency ? [fmi.primary_currency] : [];
  const hasMoreCurrencies = (fmi.currency_scope?.split(",").length ?? 0) > 4;

  return (
    <Link href={`/fmis/${fmi.id}`}>
      <Card
        className="group h-full border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer bg-white"
        data-testid={`card-fmi-${fmi.id}`}
      >
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm leading-snug group-hover:text-blue-700 transition-colors line-clamp-2">
                {fmi.name}
              </h3>
              {fmi.short_name && (
                <span className="text-xs text-slate-400 font-medium">{fmi.short_name}</span>
              )}
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 shrink-0 mt-0.5 transition-colors" />
          </div>

          {/* Type + Subtype */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={`text-xs font-medium ${TYPE_COLORS[fmi.type] ?? ""}`}>
              {TYPE_LABELS[fmi.type] ?? fmi.type}
            </Badge>
            {fmi.subtype && (
              <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                {fmi.subtype}
              </Badge>
            )}
          </div>

          {/* Currency scope */}
          {currencies.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {currencies.map(c => (
                <span key={c} className="text-xs font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                  {c}
                </span>
              ))}
              {hasMoreCurrencies && (
                <span className="text-xs text-slate-400 px-1">+more</span>
              )}
            </div>
          )}

          {/* Geo scope */}
          {fmi.geographic_scope && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Globe className="w-3 h-3 shrink-0" />
              <span className="truncate">{fmi.geographic_scope}</span>
            </div>
          )}

          {/* Operator */}
          {fmi.operator_name && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-auto">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{fmi.operator_name}</span>
            </div>
          )}

          {/* Status + Systemic importance */}
          {(fmi.status || fmi.systemic_importance) && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
              {fmi.status && fmi.status !== "Active" && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50">
                  {fmi.status}
                </Badge>
              )}
              {fmi.systemic_importance === "Systemically Important" && (
                <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50">
                  Systemically Important
                </Badge>
              )}
            </div>
          )}
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
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
    </Card>
  );
}

export default function FmiProfiles() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [subtypeFilter, setSubtypeFilter] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery<FmiTaxonomy[]>({
    queryKey: ["/api/fmi-taxonomy"],
  });

  const availableSubtypes = [...new Set(
    items
      .filter(i => typeFilter === "all" || i.type === typeFilter)
      .map(i => i.subtype)
      .filter(Boolean)
  )].sort() as string[];

  const filtered = items.filter(item => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (subtypeFilter !== "all" && item.subtype !== subtypeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.short_name ?? "").toLowerCase().includes(q) ||
        (item.jurisdiction ?? "").toLowerCase().includes(q) ||
        (item.currency_scope ?? "").toLowerCase().includes(q) ||
        (item.primary_currency ?? "").toLowerCase().includes(q) ||
        (item.operator_name ?? "").toLowerCase().includes(q) ||
        (item.region ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const typeCounts = FMI_TAXONOMY_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = items.filter(i => i.type === t).length;
    return acc;
  }, {});

  const hasFilters = typeFilter !== "all" || subtypeFilter !== "all" || search;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Financial Market Infrastructures</h1>
        <p className="text-slate-500 text-sm mt-1">
          Payments FMI taxonomy — {items.length} infrastructures across {FMI_TAXONOMY_TYPES.length} types.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left sidebar — type facets */}
        <div className="w-52 shrink-0 space-y-1" data-testid="sidebar-fmi-types">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-2 pb-1">Filter by Type</p>
          <button
            onClick={() => { setTypeFilter("all"); setSubtypeFilter("all"); }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
              typeFilter === "all"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            data-testid="filter-type-all"
          >
            <span>All FMIs</span>
            <span className={`text-xs font-medium ${typeFilter === "all" ? "text-blue-100" : "text-slate-400"}`}>
              {items.length}
            </span>
          </button>
          {FMI_TAXONOMY_TYPES.map(t => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setSubtypeFilter("all"); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                typeFilter === t
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              data-testid={`filter-type-${t.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <span className="leading-snug">{TYPE_LABELS[t] ?? t}</span>
              <span className={`text-xs font-medium shrink-0 ml-1 ${typeFilter === t ? "text-blue-100" : "text-slate-400"}`}>
                {typeCounts[t]}
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
                placeholder="Search by name, currency, jurisdiction, operator…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
                data-testid="input-fmi-search"
              />
            </div>
            <Select value={subtypeFilter} onValueChange={setSubtypeFilter} disabled={availableSubtypes.length === 0}>
              <SelectTrigger className="h-9 w-52" data-testid="select-fmi-subtype">
                <SelectValue placeholder="All Subtypes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subtypes</SelectItem>
                {availableSubtypes.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setTypeFilter("all"); setSubtypeFilter("all"); setSearch(""); }}
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
                <Button variant="link" size="sm" onClick={() => { setTypeFilter("all"); setSubtypeFilter("all"); setSearch(""); }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(fmi => <FmiCard key={fmi.id} fmi={fmi} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
