import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Globe, Building2, Users, ShieldCheck, BookOpen,
  Target, Layers, Zap, ChevronRight, AlertCircle, ExternalLink,
} from "lucide-react";
import type { FmiTaxonomy } from "@shared/schema";

const TYPE_COLORS: Record<string, string> = {
  "Settlement Systems": "bg-blue-100 text-blue-700 border-blue-200",
  "Clearing Systems": "bg-purple-100 text-purple-700 border-purple-200",
  "Instant Payment Infrastructures": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Reachability and Network Infrastructures": "bg-orange-100 text-orange-700 border-orange-200",
  "Payment Scheme Infrastructures": "bg-pink-100 text-pink-700 border-pink-200",
  "Cross-Border and Interoperability Infrastructures": "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function Field({ label, value }: { label: string; value?: string | null | boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-slate-700 leading-relaxed">
        {typeof value === "boolean" ? (value ? "Yes" : "No") : value}
      </p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border border-slate-200">
      <CardHeader className="pb-3 pt-4 px-5 border-b border-slate-100">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {children}
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-6 w-80" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="border border-slate-200">
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function FmiProfileDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: fmi, isLoading, isError } = useQuery<FmiTaxonomy>({
    queryKey: ["/api/fmi-taxonomy", id],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/fmi-taxonomy/${id}`, {
        headers: token ? { "X-Auth-Token": token } : {},
      });
      if (!res.ok) throw new Error("FMI not found");
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) return <DetailSkeleton />;

  if (isError || !fmi) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">FMI not found.</p>
        <Link href="/fmis">
          <Button variant="link" size="sm" className="mt-2">Back to FMIs</Button>
        </Link>
      </div>
    );
  }

  const currencies = fmi.currency_scope
    ? fmi.currency_scope.split(",").map(c => c.trim())
    : fmi.primary_currency ? [fmi.primary_currency] : [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <Link href="/fmis">
        <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 -ml-2" data-testid="button-fmi-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> All FMIs
        </Button>
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight" data-testid="text-fmi-name">
              {fmi.name}
            </h1>
            {fmi.short_name && (
              <p className="text-slate-400 text-sm font-medium mt-0.5">{fmi.short_name}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {fmi.status && fmi.status !== "Active" && (
              <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                {fmi.status}
              </Badge>
            )}
            {fmi.systemic_importance && (
              <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-xs">
                {fmi.systemic_importance}
              </Badge>
            )}
          </div>
        </div>

        {/* Type / Subtype / Domain breadcrumb */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400">{fmi.domain}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <Badge variant="outline" className={`text-xs font-medium ${TYPE_COLORS[fmi.type] ?? ""}`}>
            {fmi.type}
          </Badge>
          {fmi.subtype && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                {fmi.subtype}
              </Badge>
            </>
          )}
        </div>

        {/* Currency badges */}
        {currencies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {currencies.map(c => (
              <span
                key={c}
                className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200"
                data-testid={`badge-currency-${c}`}
              >
                {c}
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        {fmi.summary && (
          <p className="text-slate-600 text-sm leading-relaxed border-l-4 border-blue-200 pl-4 bg-blue-50/40 py-2 rounded-r-md">
            {fmi.summary}
          </p>
        )}
      </div>

      <Separator />

      {/* ── Sections ── */}

      {/* 1. What it is for */}
      {(fmi.objective || fmi.economic_purpose) && (
        <Section icon={Target} title="What it is for">
          {fmi.objective && (
            <div className="sm:col-span-2">
              <Field label="Objective" value={fmi.objective} />
            </div>
          )}
          {fmi.economic_purpose && (
            <div className="sm:col-span-2">
              <Field label="Economic Purpose" value={fmi.economic_purpose} />
            </div>
          )}
        </Section>
      )}

      {/* 2. What role it plays */}
      {(fmi.primary_functional_role || fmi.secondary_functional_roles?.length || fmi.cross_border_relevance) && (
        <Section icon={Layers} title="What role it plays">
          {fmi.primary_functional_role && (
            <div className="sm:col-span-2">
              <Field label="Primary Functional Role" value={fmi.primary_functional_role} />
            </div>
          )}
          {fmi.secondary_functional_roles && fmi.secondary_functional_roles.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Secondary Roles</p>
              <div className="flex flex-wrap gap-1.5">
                {fmi.secondary_functional_roles.map((r, i) => (
                  <Badge key={i} variant="outline" className="text-xs text-slate-600 border-slate-200">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {fmi.cross_border_relevance && (
            <div className="sm:col-span-2">
              <Field label="Cross-Border Relevance" value={fmi.cross_border_relevance} />
            </div>
          )}
        </Section>
      )}

      {/* 3. Where it operates */}
      {(fmi.geographic_scope || fmi.region || fmi.jurisdiction || fmi.primary_payment_domain) && (
        <Section icon={Globe} title="Where it operates">
          <Field label="Geographic Scope" value={fmi.geographic_scope} />
          <Field label="Region" value={fmi.region} />
          <Field label="Jurisdiction" value={fmi.jurisdiction} />
          <Field label="Primary Payment Domain" value={fmi.primary_payment_domain} />
        </Section>
      )}

      {/* 4. Who can access it */}
      {(fmi.participation_model || fmi.eligible_participants || fmi.access_context || fmi.central_bank_account_required != null) && (
        <Section icon={Users} title="Who can access it">
          <Field label="Participation Model" value={fmi.participation_model} />
          <Field label="Central Bank Account Required" value={fmi.central_bank_account_required} />
          {fmi.eligible_participants && (
            <div className="sm:col-span-2">
              <Field label="Eligible Participants" value={fmi.eligible_participants} />
            </div>
          )}
          {fmi.access_context && !fmi.eligible_participants && (
            <div className="sm:col-span-2">
              <Field label="Access Context" value={fmi.access_context} />
            </div>
          )}
        </Section>
      )}

      {/* 5. Who runs it */}
      {(fmi.operator_name || fmi.operator_type || fmi.oversight_authority) && (
        <Section icon={Building2} title="Who runs it">
          <Field label="Operator" value={fmi.operator_name} />
          <Field label="Operator Type" value={fmi.operator_type} />
          <div className="sm:col-span-2">
            <Field label="Oversight Authority" value={fmi.oversight_authority} />
          </div>
        </Section>
      )}

      {/* 6. Why it matters */}
      {(fmi.market_relevance_notes || fmi.systemic_importance) && (
        <Section icon={ShieldCheck} title="Why it matters">
          <Field label="Systemic Importance" value={fmi.systemic_importance} />
          {fmi.market_relevance_notes && (
            <div className="sm:col-span-2">
              <Field label="Market Relevance" value={fmi.market_relevance_notes} />
            </div>
          )}
        </Section>
      )}

      {/* 7. Sources */}
      {(fmi.primary_source || fmi.supporting_sources?.length || fmi.last_verified_date) && (
        <Card className="border border-slate-200">
          <CardHeader className="pb-3 pt-4 px-5 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-400" />
              Sources
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            {fmi.primary_source && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Primary Source</p>
                {fmi.primary_source.startsWith("http") ? (
                  <a href={fmi.primary_source} target="_blank" rel="noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    {fmi.primary_source} <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <p className="text-sm text-slate-700">{fmi.primary_source}</p>
                )}
              </div>
            )}
            {fmi.supporting_sources && fmi.supporting_sources.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Supporting Sources</p>
                <ul className="space-y-1">
                  {fmi.supporting_sources.map((s, i) => (
                    <li key={i} className="text-sm text-slate-700">{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {fmi.last_verified_date && (
              <p className="text-xs text-slate-400">
                Last verified: {new Date(fmi.last_verified_date).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Extensibility note */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs text-slate-400 space-y-1">
        <p className="font-medium text-slate-500">This profile is at v1 — identity, purpose, scope, and participation.</p>
        <p>Future additions: technical characteristics · participation data · market developments · source evidence · API layer.</p>
      </div>
    </div>
  );
}
