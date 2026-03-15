import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Globe, Building2, Layers, Zap, ChevronRight,
  AlertCircle, ArrowRight, Network, Clock, CreditCard, Info,
  Shield, Settings, MessageSquare, Users, MapPin, Banknote,
  CheckCircle2, XCircle, HelpCircle, FileText, Activity,
} from "lucide-react";
import { getAuthToken } from "@/lib/queryClient";

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

interface FmiSpec {
  id: string;
  fmi_id: string;
  performs_clearing: boolean | null;
  performs_settlement: boolean | null;
  performs_messaging: boolean | null;
  performs_scheme_governance: boolean | null;
  settlement_model: string | null;
  settlement_asset_type: string | null;
  settles_in_fmi_id: string | null;
  finality_model: string | null;
  settlement_cycle_description: string | null;
  operating_model: string | null;
  supports_24x7: boolean | null;
  processing_latency_seconds: number | null;
  operating_timezone: string | null;
  operating_hours_notes: string | null;
  primary_currency_code: string | null;
  supported_currency_codes: string | null;
  primary_message_standard: string | null;
  supported_message_standards: string | null;
  supported_message_formats: string | null;
  legacy_formats_supported: string | null;
  message_transport_network: string | null;
  direct_participation_allowed: boolean | null;
  indirect_participation_supported: boolean | null;
  sponsor_model_supported: boolean | null;
  eligible_participant_types: string | null;
  supports_cross_border_processing: boolean | null;
  supports_one_leg_out_processing: boolean | null;
  participant_location_requirement: string | null;
  debtor_location_requirement: string | null;
  creditor_location_requirement: string | null;
  prefunding_required: boolean | null;
  intraday_credit_supported: boolean | null;
  liquidity_management_notes: string | null;
}

interface SchemeSpec {
  id: string;
  fmi_id: string;
  scheme_currency_code: string | null;
  scheme_region: string | null;
  scheme_cross_border_allowed: boolean | null;
  scheme_one_leg_out_allowed: boolean | null;
  max_transaction_amount: string | null;
  settlement_deadline_seconds: number | null;
  primary_message_standard: string | null;
  scheme_rulebook_reference: string | null;
  participation_scope_notes: string | null;
}

interface Scenario {
  id: string;
  scheme_fmi_id: string;
  code: string;
  name: string;
  description: string | null;
  is_default: boolean | null;
  supports_cross_border: boolean | null;
  supports_one_leg_out: boolean | null;
  requires_special_format: boolean | null;
  message_standard: string | null;
  message_format: string | null;
  currency_code: string | null;
  geography_scope: string | null;
  notes: string | null;
  is_active: boolean | null;
}

interface CapabilityResult {
  fmi_id: string;
  fmi_name: string;
  infrastructure: {
    supports_cross_border_processing: boolean | null;
    supports_one_leg_out_processing: boolean | null;
  };
  scheme_or_scenario: {
    cross_border_allowed: boolean | null;
    one_leg_out_allowed: boolean | null;
    source: string | null;
  };
  derived: {
    actual_cross_border: boolean | null;
    actual_one_leg_out: boolean | null;
  };
}

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

function isSchemeType(categoryCode: string): boolean {
  return categoryCode.startsWith("PS-SCH") || categoryCode.startsWith("FXS-PVP");
}

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

function BoolBadge({ value, yesLabel = "Yes", noLabel = "No", unknownLabel = "Unknown" }: {
  value: boolean | null | undefined;
  yesLabel?: string;
  noLabel?: string;
  unknownLabel?: string;
}) {
  if (value === true) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1" variant="outline">
        <CheckCircle2 className="w-3 h-3" />{yesLabel}
      </Badge>
    );
  }
  if (value === false) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1" variant="outline">
        <XCircle className="w-3 h-3" />{noLabel}
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1" variant="outline">
      <HelpCircle className="w-3 h-3" />{unknownLabel}
    </Badge>
  );
}

function parseJsonArray(val: string | null | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
    return [String(parsed)];
  } catch {
    return val.split(",").map(s => s.trim()).filter(Boolean);
  }
}

function BadgeList({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-sm text-slate-400">--</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <Badge key={i} variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function SpecField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-slate-700 leading-relaxed">{value || "--"}</p>
    </div>
  );
}

function SpecBoolField({ label, value }: { label: string; value: boolean | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <BoolBadge value={value} />
    </div>
  );
}

function SpecSection({
  icon: Icon, title, children,
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

function RelationshipRow({ rel, currentId }: { rel: FmiRelationship; currentId: string }) {
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

function SpecificationsTab({ spec }: { spec: FmiSpec | null }) {
  if (!spec) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FileText className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No detailed specifications available for this FMI.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SpecSection icon={CreditCard} title="Settlement">
        <SpecField label="Settlement Model" value={spec.settlement_model} />
        <SpecField label="Settlement Asset Type" value={spec.settlement_asset_type} />
        <SpecField label="Finality Model" value={spec.finality_model} />
        <SpecField label="Settlement Cycle" value={spec.settlement_cycle_description} />
        <SpecBoolField label="Performs Clearing" value={spec.performs_clearing} />
        <SpecBoolField label="Performs Settlement" value={spec.performs_settlement} />
      </SpecSection>

      <SpecSection icon={Settings} title="Operating Model">
        <SpecField label="Operating Model" value={spec.operating_model} />
        <SpecBoolField label="24x7 Operation" value={spec.supports_24x7} />
        <SpecField label="Processing Latency" value={spec.processing_latency_seconds != null ? `${spec.processing_latency_seconds}s` : null} />
        <SpecField label="Operating Timezone" value={spec.operating_timezone} />
        <div className="sm:col-span-2">
          <SpecField label="Operating Hours Notes" value={spec.operating_hours_notes} />
        </div>
      </SpecSection>

      <SpecSection icon={MessageSquare} title="Message Standards">
        <SpecField label="Primary Standard" value={spec.primary_message_standard} />
        <SpecField label="Transport Network" value={spec.message_transport_network} />
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Supported Standards</p>
          <BadgeList items={parseJsonArray(spec.supported_message_standards)} />
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Supported Formats</p>
          <BadgeList items={parseJsonArray(spec.supported_message_formats)} />
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Legacy Formats</p>
          <BadgeList items={parseJsonArray(spec.legacy_formats_supported)} />
        </div>
        <SpecBoolField label="Performs Messaging" value={spec.performs_messaging} />
      </SpecSection>

      <SpecSection icon={Users} title="Participation">
        <SpecBoolField label="Direct Participation" value={spec.direct_participation_allowed} />
        <SpecBoolField label="Indirect Participation" value={spec.indirect_participation_supported} />
        <SpecBoolField label="Sponsor Model" value={spec.sponsor_model_supported} />
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Eligible Participant Types</p>
          <BadgeList items={parseJsonArray(spec.eligible_participant_types)} />
        </div>
        <SpecBoolField label="Scheme Governance" value={spec.performs_scheme_governance} />
      </SpecSection>

      <SpecSection icon={MapPin} title="Reachability & Capabilities">
        <SpecBoolField label="Cross-Border Processing" value={spec.supports_cross_border_processing} />
        <SpecBoolField label="One-Leg-Out Processing" value={spec.supports_one_leg_out_processing} />
        <SpecField label="Participant Location Req." value={spec.participant_location_requirement} />
        <SpecField label="Debtor Location Req." value={spec.debtor_location_requirement} />
        <SpecField label="Creditor Location Req." value={spec.creditor_location_requirement} />
        <SpecField label="Primary Currency" value={spec.primary_currency_code} />
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Supported Currencies</p>
          <BadgeList items={parseJsonArray(spec.supported_currency_codes)} />
        </div>
      </SpecSection>

      <SpecSection icon={Banknote} title="Liquidity">
        <SpecBoolField label="Prefunding Required" value={spec.prefunding_required} />
        <SpecBoolField label="Intraday Credit Supported" value={spec.intraday_credit_supported} />
        <div className="sm:col-span-2">
          <SpecField label="Liquidity Management Notes" value={spec.liquidity_management_notes} />
        </div>
      </SpecSection>
    </div>
  );
}

function SchemeRulesTab({ scheme }: { scheme: SchemeSpec | null }) {
  if (!scheme) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Shield className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No scheme rules available for this FMI.</p>
      </div>
    );
  }

  const deadlineDisplay = scheme.settlement_deadline_seconds != null
    ? scheme.settlement_deadline_seconds < 60
      ? `${scheme.settlement_deadline_seconds} seconds`
      : `${Math.round(scheme.settlement_deadline_seconds / 60)} minutes`
    : null;

  return (
    <div className="space-y-5">
      <Card className="border border-slate-200">
        <CardHeader className="pb-3 pt-4 px-5 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" />
            Payment Scheme Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <SpecField label="Scheme Currency" value={scheme.scheme_currency_code} />
          <SpecField label="Scheme Region" value={scheme.scheme_region} />
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Cross-Border Allowed</p>
            <BoolBadge value={scheme.scheme_cross_border_allowed} yesLabel="Allowed" noLabel="Not Allowed" unknownLabel="Scenario-Specific" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">One-Leg-Out Allowed</p>
            <BoolBadge value={scheme.scheme_one_leg_out_allowed} yesLabel="Allowed" noLabel="Not Allowed" unknownLabel="Scenario-Specific" />
          </div>
          <SpecField label="Max Transaction Amount" value={scheme.max_transaction_amount} />
          <SpecField label="Settlement Deadline" value={deadlineDisplay} />
          <SpecField label="Message Standard" value={scheme.primary_message_standard} />
          <SpecField label="Rulebook Reference" value={scheme.scheme_rulebook_reference} />
          {scheme.participation_scope_notes && (
            <div className="sm:col-span-2">
              <SpecField label="Participation Scope Notes" value={scheme.participation_scope_notes} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioCapability({ fmiId, scenarioId }: { fmiId: string; scenarioId: string }) {
  const { data, isLoading } = useQuery<CapabilityResult>({
    queryKey: ["/api/fmi-entries", fmiId, "capability", scenarioId],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch(`/api/fmi-entries/${fmiId}/capability?scenario_id=${scenarioId}`, {
        headers: token ? { "X-Auth-Token": token } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch capability");
      return res.json();
    },
    enabled: !!fmiId && !!scenarioId,
  });

  if (isLoading) return <Skeleton className="h-5 w-16 rounded-full" />;
  if (!data) return <span className="text-slate-400 text-xs">--</span>;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 w-8">CB:</span>
        <BoolBadge value={data.derived.actual_cross_border} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 w-8">OLO:</span>
        <BoolBadge value={data.derived.actual_one_leg_out} />
      </div>
    </div>
  );
}

function ScenariosTab({ scenarios, fmiId }: { scenarios: Scenario[]; fmiId: string }) {
  if (!scenarios.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Activity className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No processing scenarios defined for this scheme.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border border-blue-200 bg-blue-50/50">
        <CardContent className="p-4">
          <div className="flex gap-2 items-start">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-700">
              <span className="font-medium">Derived Capability</span> = Infrastructure capability AND scheme/scenario rule.
              A capability is only "Yes" when both the infrastructure supports it and the scheme/scenario allows it.
              "Unknown" means one or both sides have no data.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200">
        <CardHeader className="pb-3 pt-4 px-5 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400" />
            Processing Scenarios
            <span className="ml-1 text-xs font-normal text-slate-400">({scenarios.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="pl-5 font-semibold">Scenario</TableHead>
                  <TableHead className="font-semibold">Cross-Border</TableHead>
                  <TableHead className="font-semibold">One-Leg-Out</TableHead>
                  <TableHead className="font-semibold">Message Format</TableHead>
                  <TableHead className="font-semibold">Geography</TableHead>
                  <TableHead className="font-semibold">Derived Capability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarios.map(sc => (
                  <TableRow key={sc.id} data-testid={`row-scenario-${sc.code}`}>
                    <TableCell className="pl-5">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{sc.name}</p>
                        <p className="text-xs font-mono text-slate-400">{sc.code}</p>
                        {sc.description && (
                          <p className="text-xs text-slate-500 mt-0.5 max-w-xs">{sc.description}</p>
                        )}
                        {sc.is_default && (
                          <Badge className="mt-1 text-xs bg-blue-100 text-blue-700 border-blue-200" variant="outline">Default</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <BoolBadge value={sc.supports_cross_border} />
                    </TableCell>
                    <TableCell>
                      <BoolBadge value={sc.supports_one_leg_out} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {sc.message_standard && (
                          <Badge variant="outline" className="text-xs bg-slate-50">{sc.message_standard}</Badge>
                        )}
                        {sc.message_format && (
                          <p className="text-xs text-slate-500">{sc.message_format}</p>
                        )}
                        {!sc.message_standard && !sc.message_format && (
                          <span className="text-xs text-slate-400">--</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">{sc.geography_scope || "--"}</span>
                    </TableCell>
                    <TableCell>
                      <ScenarioCapability fmiId={fmiId} scenarioId={sc.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {scenarios.length >= 2 && scenarios.some(s => s.supports_one_leg_out === true) && scenarios.some(s => s.supports_one_leg_out === false) && (
        <Card className="border border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex gap-2 items-start">
              <Zap className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <span className="font-medium">OLO Contrast: </span>
                {scenarios.filter(s => s.supports_one_leg_out === true).map(s => s.name).join(", ")}
                {" supports One-Leg-Out, while "}
                {scenarios.filter(s => s.supports_one_leg_out === false).map(s => s.name).join(", ")}
                {" does not. The scenario determines whether cross-border payments with one domestic leg are processed."}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function FmiProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: entry, isLoading, isError } = useQuery<FmiEntryDetail>({
    queryKey: ["/api/fmi-entries", id],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch(`/api/fmi-entries/${id}`, {
        headers: token ? { "X-Auth-Token": token } : {},
      });
      if (!res.ok) throw new Error("FMI not found");
      return res.json();
    },
    enabled: !!id,
  });

  const isScheme = entry ? isSchemeType(entry.category_code) : false;

  useEffect(() => {
    setActiveTab("overview");
  }, [id]);

  const { data: specData, isLoading: specLoading } = useQuery<FmiSpec>({
    queryKey: ["/api/fmi-specifications", id],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch(`/api/fmi-specifications/${id}`, {
        headers: token ? { "X-Auth-Token": token } : {},
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load specs");
      return res.json();
    },
    enabled: !!id && !!entry,
  });

  const { data: schemeData, isLoading: schemeLoading } = useQuery<SchemeSpec>({
    queryKey: ["/api/payment-scheme-specs", id],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch(`/api/payment-scheme-specs/${id}`, {
        headers: token ? { "X-Auth-Token": token } : {},
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load scheme specs");
      return res.json();
    },
    enabled: !!id && isScheme,
  });

  const { data: scenariosData = [], isLoading: scenariosLoading } = useQuery<Scenario[]>({
    queryKey: ["/api/payment-scheme-scenarios", id],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch(`/api/payment-scheme-scenarios/${id}`, {
        headers: token ? { "X-Auth-Token": token } : {},
      });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("Failed to load scenarios");
      return res.json();
    },
    enabled: !!id && isScheme,
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
    <div className="space-y-6 max-w-5xl">
      <Link href="/fmis">
        <Button
          variant="ghost" size="sm"
          className="text-slate-500 hover:text-slate-800 -ml-2"
          data-testid="button-fmi-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> All FMIs
        </Button>
      </Link>

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
            {isScheme && (
              <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">
                Payment Scheme
              </Badge>
            )}
          </div>
        </div>

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

        {entry.primary_currency_code && (
          <span
            className="inline-block text-sm font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-md"
            data-testid="badge-currency"
          >
            {entry.primary_currency_code}
          </span>
        )}

        {entry.description && (
          <p className="text-slate-600 text-sm leading-relaxed border-l-4 border-blue-200 pl-4 bg-blue-50/40 py-2 rounded-r-md">
            {entry.description}
          </p>
        )}
      </div>

      <Separator />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList data-testid="tabs-fmi-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="specifications" data-testid="tab-specifications">Specifications</TabsTrigger>
          {isScheme && (
            <TabsTrigger value="scheme-rules" data-testid="tab-scheme-rules">Scheme Rules</TabsTrigger>
          )}
          {isScheme ? (
            <TabsTrigger value="scenarios" data-testid="tab-scenarios">Scenarios</TabsTrigger>
          ) : (
            <TabsTrigger value="related" data-testid="tab-related-schemes">Related Schemes</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          {entry.functional_role_summary && (
            <Section icon={Layers} title="Functional Role">
              <div className="sm:col-span-2">
                <p className="text-sm text-slate-700 leading-relaxed">{entry.functional_role_summary}</p>
              </div>
            </Section>
          )}

          {(entry.settlement_model || entry.supports_24x7 != null || entry.supports_cross_border != null || entry.primary_currency_code) && (
            <Section icon={CreditCard} title="Technical Characteristics">
              <Field label="Settlement Model" value={entry.settlement_model} />
              <Field label="Primary Currency" value={entry.primary_currency_code} />
              <Field label="24x7 Operation" value={entry.supports_24x7} />
              <Field label="Cross-Border Support" value={entry.supports_cross_border} />
              {entry.supports_one_leg_out != null && (
                <Field label="One-Leg-Out Support" value={entry.supports_one_leg_out} />
              )}
            </Section>
          )}

          {entry.operator_name && (
            <Section icon={Building2} title="Operator">
              <div className="sm:col-span-2">
                <Field label="Operator / Owner" value={entry.operator_name} />
              </div>
            </Section>
          )}

          {entry.notes && (
            <Section icon={Info} title="Notes" fullWidth>
              <p className="text-sm text-slate-600 leading-relaxed">{entry.notes}</p>
            </Section>
          )}

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

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs text-slate-400 space-y-1">
            <p className="font-medium text-slate-500">FMI Taxonomy v2 -- structured domain/category hierarchy.</p>
            <p>
              Domain: <span className="font-mono">{entry.domain_code}</span>
              {" . "}Category: <span className="font-mono">{entry.category_code}</span>
              {entry.code && <>{" . "}Code: <span className="font-mono">{entry.code}</span></>}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="specifications">
          {specLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="border border-slate-200">
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <SpecificationsTab spec={specData ?? null} />
          )}
        </TabsContent>

        {isScheme && (
          <TabsContent value="scheme-rules">
            {schemeLoading ? (
              <Card className="border border-slate-200">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ) : (
              <SchemeRulesTab scheme={schemeData ?? null} />
            )}
          </TabsContent>
        )}

        {isScheme ? (
          <TabsContent value="scenarios">
            {scenariosLoading ? (
              <Card className="border border-slate-200">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ) : (
              <ScenariosTab scenarios={scenariosData} fmiId={entry.id} />
            )}
          </TabsContent>
        ) : (
          <TabsContent value="related">
            {hasRelationships ? (
              <Card className="border border-slate-200">
                <CardHeader className="pb-3 pt-4 px-5 border-b border-slate-100">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Network className="w-4 h-4 text-slate-400" />
                    Related Schemes
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
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Network className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No related schemes found.</p>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
