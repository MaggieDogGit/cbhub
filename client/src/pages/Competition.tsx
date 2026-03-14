import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Swords, Building2, BarChart3, Filter, Download, ArrowRight, Eye, Users,
  Globe, TrendingUp, Clock,
} from "lucide-react";
import type { BankingGroup, IntelObservation } from "@shared/schema";

export default function Competition() {
  const { data: groups = [], isLoading: loadingGroups } = useQuery<BankingGroup[]>({
    queryKey: ["/api/banking-groups"],
  });
  const { data: intel = [], isLoading: loadingIntel } = useQuery<IntelObservation[]>({
    queryKey: ["/api/intel"],
  });

  const competitors = intel.filter(o => o.obs_type === "competitor");
  const competitorGroupIds = new Set(competitors.map(o => o.banking_group_id).filter(Boolean));
  const competitorGroups = groups.filter(g => competitorGroupIds.has(g.id));

  const isLoading = loadingGroups || loadingIntel;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Swords className="w-5 h-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-competition-title">
              Competition
            </h1>
          </div>
          <p className="text-slate-500 text-sm">
            Correspondent banking competitive benchmarking and analysis.
          </p>
        </div>
      </div>

      {/* Status banner */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-4 flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-violet-500 mt-1.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-violet-800 mb-0.5">Benchmarking dashboard — coming next</p>
          <p className="text-sm text-violet-700">
            This page will become the primary competitive analysis workspace. The underlying data model
            is ready — Banking Groups and Legal Entities capture the provider hierarchy, and Intel
            observations track competitor and provider tags. Comparison views, currency overlaps, and
            export tools are the next build step.
          </p>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-50 shrink-0">
              <Swords className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900" data-testid="text-competitor-count">
                {isLoading ? "—" : competitorGroups.length}
              </div>
              <div className="text-xs text-slate-500">Competitor groups tagged</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 shrink-0">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900" data-testid="text-total-groups">
                {isLoading ? "—" : groups.length}
              </div>
              <div className="text-xs text-slate-500">Banking groups in scope</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm col-span-2 sm:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50 shrink-0">
              <Eye className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900" data-testid="text-intel-count">
                {isLoading ? "—" : intel.length}
              </div>
              <div className="text-xs text-slate-500">Intel observations</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature preview cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">
          Planned capabilities
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: BarChart3,
              color: "text-blue-600 bg-blue-50",
              title: "Side-by-side comparison",
              desc: "Compare CB service coverage, currency depth, and market presence across competitor groups.",
            },
            {
              icon: Filter,
              color: "text-emerald-600 bg-emerald-50",
              title: "Filters & segmentation",
              desc: "Segment by G-SIB status, home currency, RTGS membership, CB probability, and geography.",
            },
            {
              icon: Download,
              color: "text-violet-600 bg-violet-50",
              title: "Export & reporting",
              desc: "Export comparison tables and coverage maps for use in analysis and client presentations.",
            },
          ].map((f) => (
            <Card key={f.title} className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${f.color}`}>
                  <f.icon className="w-5 h-5" />
                </div>
                <p className="font-semibold text-slate-800 text-sm mb-1">{f.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                <Badge variant="outline" className="mt-3 text-[10px] text-slate-400 border-slate-200">
                  Planned
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Competitors list (populated from Intel observations) */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Swords className="w-4 h-4 text-violet-500" />
              Groups tagged as competitors
            </CardTitle>
            <Link href="/banking-groups">
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                Manage groups <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            </div>
          ) : competitorGroups.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <Swords className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-slate-500 text-sm">No competitor groups tagged yet.</p>
              <p className="text-slate-400 text-xs max-w-sm mx-auto">
                Open a banking group and add a Competitor intel observation to start building your
                competition list.
              </p>
              <Link href="/banking-groups">
                <Button variant="outline" size="sm" className="mt-2 text-xs gap-1">
                  Browse Banking Groups <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {competitorGroups.map((g) => {
                const groupCompetitorObs = competitors.filter(o => o.banking_group_id === g.id);
                return (
                  <div
                    key={g.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    data-testid={`competitor-row-${g.id}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{g.group_name}</p>
                      <p className="text-xs text-slate-400">
                        {g.headquarters_country && `${g.headquarters_country} · `}
                        {g.gsib_status ? `${g.gsib_status} · ` : ""}
                        {groupCompetitorObs.length} observation{groupCompetitorObs.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {g.primary_currency && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {g.primary_currency}
                      </Badge>
                    )}
                    {g.cb_probability && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${
                          g.cb_probability === "High"
                            ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                            : g.cb_probability === "Medium"
                            ? "border-amber-300 text-amber-700 bg-amber-50"
                            : "border-slate-200 text-slate-500"
                        }`}
                      >
                        CB {g.cb_probability}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* How to use */}
      <Card className="border-0 shadow-sm bg-slate-50">
        <CardContent className="p-5">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
            How to build your competition list
          </p>
          <ol className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-2">
              <span className="font-bold text-blue-600 shrink-0">1.</span>
              <span>
                Go to <Link href="/banking-groups" className="text-blue-600 hover:underline font-medium">Banking Groups</Link> and find a competitor.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-blue-600 shrink-0">2.</span>
              <span>Open the group detail and add a <strong>Competitor</strong> intel observation.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-blue-600 shrink-0">3.</span>
              <span>The group will appear here and in competition filters across the platform.</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
