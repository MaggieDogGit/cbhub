import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Globe, Building2, Layers, Zap, ChevronRight,
  AlertCircle, ArrowRight, Network, Clock, CreditCard, Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface FmiRelationship {
  id: string;
  notes: string | null;
  is_active: boolean;
  rel_type_code: string;
  rel_type_name: string;
  source_id: string;
  source_name: string;
  source_code: string;
  target_id: string;
  target_name: string;
  target_code: string;
  target_category_name: string;
}

interface FmiEntryDetail {
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
  supports_one_leg_out: boolean | null;
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
  relationships: FmiRelationship[];
}

// ── Domain colours ─────────────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  PS:  "bg-blue-100 text-blue-800 border-blue-200",
  FXS: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CPI: "bg-purple-100 text-purple-800 border-purple-200",
  SMI: "bg-amber-100 text-amber-800 border-amber-200",
  CCP: "bg-red-100 text-red-800 border-red-200",
  TR:  "bg-indigo-100 text-indigo-800 border-indigo-200",
};

const STATUS_COLORS: Record<string, string> = {
  live:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  pilot:   "bg-amber-50 text-amber-700 border-amber-200",
  planned: "bg-blue-50 text-blue-700 border-blue-200",
  retired: "bg-slate-100 text-slate-500 border-slate-200",
};

// ── Small helpers ─────────────────────────────────────────────────────────────
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
  icon: Icon, title, children, fullWidth = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <Card className="border border-slate-200">
      <CardHeader className="pb-3 pt-4 px-5 border-b border-slate-100">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={`p-5 ${fullWidth ? "" : "grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4"}`}>
        {children}
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-80" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-5 w-36 rounded-full" />
        </div>
      </div>
      {[...Array(3)].map((_, i) => (
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

// ── Relationships section ─────────────────────────────────────────────────────
function RelationshipRow({
  rel, currentId,
}: {
  rel: FmiRelationship;
  currentId: string;
}) {
  const isSource = rel.source_id === currentId;
  const other = isSource
    ? { id: rel.target_id, name: rel.target_name, code: rel.target_code, cat: rel.target_category_name }
    : { id: rel.source_id, name: rel.source_name, code: rel.source_code, cat: rel.target_category_name };

  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-500 min-w-[180px] shrink-0">
        {isSource ? (
          <>
            <span className="text-blue-500">outgoing</span>
            <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
          </>
        ) : (
          <>
            <ArrowRight className="w-3.5 h-3.5 rotate-180 text-emerald-400" />
            <span className="text-emerald-600">incoming</span>
          </>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-500 mb-1">{rel.rel_type_name}</p>
        <Link href={`/fmis/${other.id}`}>
          <span className="text-sm font-semibold text-blue-700 hover:underline cursor-pointer">
            {other.name}
          </span>
        </Link>
        {other.code && (
          <span className="ml-2 text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {other.code}
          </span>
        )}
        <p className="text-xs text-slate-400 mt-0.5">{rel.target_category_name}</p>
        {rel.notes && (
          <p className="text-xs text-slate-500 mt-1 italic">{rel.notes}</p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FmiProfileDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: entry, isLoading, isError } = useQuery<FmiEntryDetail>({
    queryKey: ["/api/fmi-entries", id],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/fmi-entries/${id}`, {
        headers: token ? { "X-Auth-Token": token } : {},
      });
      if (!res.ok) throw new Error("FMI not found");
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) return <DetailSkeleton />;

  if (isError || !entry) {
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

  const hasRelationships = entry.relationships?.length > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <Link href="/fmis">
        <Button
          variant="ghost" size="sm"
          className="text-slate-500 hover:text-slate-800 -ml-2"
          data-testid="button-fmi-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> All FMIs
        </Button>
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-bold text-slate-900 leading-tight"
              data-testid="text-fmi-name"
            >
              {entry.name}
            </h1>
            {entry.short_name && (
              <p className="text-slate-400 text-sm font-medium mt-0.5">{entry.short_name}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge
              variant="outline"
              className={`text-xs ${STATUS_COLORS[entry.status] ?? "text-slate-500 border-slate-200"}`}
            >
              {entry.status ?? "live"}
            </Badge>
          </div>
        </div>

        {/* Domain → Category breadcrumb */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={`text-xs font-medium ${DOMAIN_COLORS[entry.domain_code] ?? ""}`}
          >
            {entry.domain_name}
          </Badge>
          {entry.parent_category_name && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                {entry.parent_category_name}
              </Badge>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <Badge variant="outline" className="text-xs text-slate-600 border-slate-300 bg-slate-50">
            {entry.category_name}
          </Badge>
          {entry.code && (
            <span className="text-xs font-mono text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded ml-2">
              {entry.code}
            </span>
          )}
        </div>

        {/* Currency */}
        {entry.primary_currency_code && (
          <span
            className="inline-block text-sm font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-md"
            data-testid="badge-currency"
          >
            {entry.primary_currency_code}
          </span>
        )}

        {/* Description */}
        {entry.description && (
          <p className="text-slate-600 text-sm leading-relaxed border-l-4 border-blue-200 pl-4 bg-blue-50/40 py-2 rounded-r-md">
            {entry.description}
          </p>
        )}
      </div>

      <Separator />

      {/* ── Functional Role ── */}
      {entry.functional_role_summary && (
        <Section icon={Layers} title="Functional Role">
          <div className="sm:col-span-2">
            <p className="text-sm text-slate-700 leading-relaxed">{entry.functional_role_summary}</p>
          </div>
        </Section>
      )}

      {/* ── Technical Characteristics ── */}
      {(entry.settlement_model || entry.supports_24x7 != null || entry.supports_cross_border != null || entry.primary_currency_code) && (
        <Section icon={CreditCard} title="Technical Characteristics">
          <Field label="Settlement Model" value={entry.settlement_model} />
          <Field label="Primary Currency" value={entry.primary_currency_code} />
          <Field label="24×7 Operation" value={entry.supports_24x7} />
          <Field label="Cross-Border Support" value={entry.supports_cross_border} />
          {entry.supports_one_leg_out != null && (
            <Field label="One-Leg-Out Support" value={entry.supports_one_leg_out} />
          )}
        </Section>
      )}

      {/* ── Operator ── */}
      {entry.operator_name && (
        <Section icon={Building2} title="Operator">
          <div className="sm:col-span-2">
            <Field label="Operator / Owner" value={entry.operator_name} />
          </div>
        </Section>
      )}

      {/* ── Notes ── */}
      {entry.notes && (
        <Section icon={Info} title="Notes" fullWidth>
          <p className="text-sm text-slate-600 leading-relaxed">{entry.notes}</p>
        </Section>
      )}

      {/* ── FMI Relationships ── */}
      {hasRelationships && (
        <Card className="border border-slate-200">
          <CardHeader className="pb-3 pt-4 px-5 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Network className="w-4 h-4 text-slate-400" />
              FMI Relationships
              <span className="ml-1 text-xs font-normal text-slate-400">
                ({entry.relationships.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 divide-y divide-slate-100">
            {entry.relationships.map(rel => (
              <RelationshipRow key={rel.id} rel={rel} currentId={entry.id} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs text-slate-400 space-y-1">
        <p className="font-medium text-slate-500">FMI Taxonomy v2 — structured domain/category hierarchy.</p>
        <p>
          Domain: <span className="font-mono">{entry.domain_code}</span>
          {" · "}Category: <span className="font-mono">{entry.category_code}</span>
          {entry.code && <>{" · "}Code: <span className="font-mono">{entry.code}</span></>}
        </p>
      </div>
    </div>
  );
}
