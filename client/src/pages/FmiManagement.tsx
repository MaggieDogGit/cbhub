import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertFmiRegistrySchema, FMI_CATEGORIES } from "@shared/schema";
import type { FmiRegistry, Fmi, FmiResearchJob } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { 
  Network, Globe, ExternalLink, Trash2, Plus, 
  Search, Bot, Play, StopCircle, Loader2, 
  CheckCircle2, XCircle, Clock, ChevronRight, ChevronDown 
} from "lucide-react";

export default function FmiManagement() {
  const [activeTab, setActiveTab] = useState("registry");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">FMI Management</h1>
          <p className="text-slate-500 text-sm mt-1">Manage Financial Market Infrastructures registry, memberships, and research jobs.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="registry" data-testid="tab-registry">Registry</TabsTrigger>
          <TabsTrigger value="memberships" data-testid="tab-memberships">Memberships</TabsTrigger>
          <TabsTrigger value="research" data-testid="tab-research">Research</TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="space-y-4">
          <RegistryTab />
        </TabsContent>

        <TabsContent value="memberships" className="space-y-4">
          <MembershipsTab />
        </TabsContent>

        <TabsContent value="research" className="space-y-4">
          <ResearchTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RegistryTab() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { data: registry = [], isLoading } = useQuery<FmiRegistry[]>({
    queryKey: ["/api/fmi-registry"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/fmi-registry/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fmi-registry"] });
      toast({ title: "Entry deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    }
  });

  const form = useForm({
    resolver: zodResolver(insertFmiRegistrySchema),
    defaultValues: {
      fmi_name: "",
      fmi_type: "",
      description: "",
      website: "",
      membership_url: "",
      notes: "",
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/fmi-registry", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fmi-registry"] });
      setIsAddDialogOpen(false);
      form.reset();
      toast({ title: "FMI added to registry" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add FMI", description: error.message, variant: "destructive" });
    }
  });

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>FMI Registry</CardTitle>
          <CardDescription>Authoritative catalog of Financial Market Infrastructures</CardDescription>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-fmi">
              <Plus className="w-4 h-4 mr-2" />
              Add FMI
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add FMI to Registry</DialogTitle>
              <DialogDescription>Create a new entry in the authoritative FMI catalog.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => addMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="fmi_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>FMI Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-fmi-name" placeholder="e.g. TARGET2" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fmi_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>FMI Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-fmi-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FMI_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-website" placeholder="https://..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="membership_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Membership URL</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-membership-url" placeholder="https://..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={addMutation.isPending} data-testid="button-submit-fmi">
                    {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add FMI
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>FMI Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24 text-center">Links</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registry.map((entry) => (
              <TableRow key={entry.id} data-testid={`row-registry-${entry.id}`}>
                <TableCell className="font-medium">{entry.fmi_name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{entry.fmi_type}</Badge>
                </TableCell>
                <TableCell className="text-slate-500 text-sm max-w-md truncate">
                  {entry.description}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-2">
                    {entry.website && (
                      <a href={entry.website} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 transition-colors" data-testid={`link-website-${entry.id}`}>
                        <Globe className="w-4 h-4" />
                      </a>
                    )}
                    {entry.membership_url && (
                      <a href={entry.membership_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 transition-colors" data-testid={`link-membership-${entry.id}`}>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-red-600 h-8 w-8"
                    onClick={() => deleteMutation.mutate(entry.id)}
                    data-testid={`button-delete-fmi-${entry.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MembershipsTab() {
  const { toast } = useToast();
  const { data: fmis = [], isLoading } = useQuery<Fmi[]>({
    queryKey: ["/api/fmis"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/fmis/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fmis"] });
      toast({ title: "Membership deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    }
  });

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  // Group memberships by FMI name
  const grouped = fmis.reduce((acc, fmi) => {
    const name = fmi.fmi_name || "Unknown";
    if (!acc[name]) acc[name] = [];
    acc[name].push(fmi);
    return acc;
  }, {} as Record<string, Fmi[]>);

  const fmiNames = Object.keys(grouped).sort();

  return (
    <Card>
      <CardHeader>
        <CardTitle>FMI Memberships</CardTitle>
        <CardDescription>Recorded direct memberships per FMI</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fmiNames.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border-2 border-dashed rounded-lg">
            No memberships recorded yet.
          </div>
        ) : (
          fmiNames.map(name => (
            <FmiGroupSection key={name} name={name} members={grouped[name]} onDelete={(id) => deleteMutation.mutate(id)} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FmiGroupSection({ name, members, onDelete }: { name: string; members: Fmi[]; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`fmi-group-${name.toLowerCase().replace(/\s+/g, '-')}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <span className="font-semibold text-slate-900">{name}</span>
          <Badge variant="secondary" className="bg-white">{members.length} members</Badge>
        </div>
      </button>
      {expanded && (
        <div className="p-0 border-t">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="pl-11">Legal Entity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Member Since</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(member => (
                <TableRow key={member.id} data-testid={`row-membership-${member.id}`}>
                  <TableCell className="pl-11 font-medium">{member.legal_entity_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{member.fmi_type}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">{member.member_since || "—"}</TableCell>
                  <TableCell>
                    {member.source?.startsWith("http") ? (
                      <a href={member.source} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline text-xs" data-testid={`link-source-${member.id}`}>
                        Source <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-400 text-xs italic">{member.source || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-slate-400 hover:text-red-600 h-8 w-8"
                      onClick={() => onDelete(member.id)}
                      data-testid={`button-delete-membership-${member.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ResearchTab() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedFmi, setSelectedFmi] = useState<string>("");

  const { data: registry = [] } = useQuery<FmiRegistry[]>({
    queryKey: ["/api/fmi-registry"],
  });

  const { data: jobs = [], isLoading: isJobsLoading } = useQuery<FmiResearchJob[]>({
    queryKey: ["/api/fmi-research-jobs"],
    refetchInterval: (query) => {
      const data = query.state.data as FmiResearchJob[] | undefined;
      const hasActive = data?.some(j => j.status === "pending" || j.status === "running");
      return hasActive ? 5000 : 15000;
    },
  });

  const runMutation = useMutation({
    mutationFn: async (fmiName: string) => {
      const res = await apiRequest("POST", "/api/fmi-research-jobs", { fmi_name: fmiName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fmi-research-jobs"] });
      toast({ title: "Research job queued", description: "The agent will begin researching members shortly." });
      setSelectedFmi("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to queue job", description: error.message, variant: "destructive" });
    }
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/fmi-research-jobs/stop-queue");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/fmi-research-jobs"] });
      toast({ title: "Queue stopped", description: `${data.stopped} jobs cancelled.` });
    },
    onError: (error: any) => {
      toast({ title: "Failed to stop queue", description: error.message, variant: "destructive" });
    }
  });

  const sortedJobs = [...jobs].sort((a, b) => {
    return new Date(b.queued_at!).getTime() - new Date(a.queued_at!).getTime();
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Membership Research</CardTitle>
          <CardDescription>Run the AI agent to discover and record direct FMI members</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end max-w-2xl">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium text-slate-700">Select FMI from Registry</label>
              <Select value={selectedFmi} onValueChange={setSelectedFmi}>
                <SelectTrigger data-testid="select-research-fmi">
                  <SelectValue placeholder="Select FMI to research..." />
                </SelectTrigger>
                <SelectContent>
                  {registry.map(entry => (
                    <SelectItem key={entry.id} value={entry.fmi_name}>{entry.fmi_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                disabled={!selectedFmi || runMutation.isPending}
                onClick={() => runMutation.mutate(selectedFmi)}
                data-testid="button-run-research"
              >
                {runMutation.isPending ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                Run Research
              </Button>
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                disabled={!jobs.some(j => j.status === "pending") || stopMutation.isPending}
                onClick={() => stopMutation.mutate()}
                data-testid="button-stop-queue"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                Stop Queue
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Research Jobs</CardTitle>
          <CardDescription>Status and results of automated membership research</CardDescription>
        </CardHeader>
        <CardContent>
          {isJobsLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
          ) : sortedJobs.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No research jobs yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>FMI Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Queued At</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="text-right">Chat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedJobs.map(job => (
                  <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                    <TableCell className="font-medium">{job.fmi_name}</TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} error={job.error_message} />
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs">
                      {job.queued_at ? new Date(job.queued_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-slate-700">Added: <span className="font-semibold text-emerald-600">{job.members_added || 0}</span></span>
                        <span className="text-xs text-slate-700">Skipped: <span className="font-semibold text-slate-500">{job.members_skipped || 0}</span></span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500 max-w-xs truncate" title={job.summary || ""}>
                      {job.summary || job.error_message || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {job.conversation_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-600"
                          onClick={() => setLocation(`/agent?conv=${job.conversation_id}`)}
                          data-testid={`link-conversation-${job.id}`}
                        >
                          <Bot className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function JobStatusBadge({ status, error }: { status: string; error?: string | null }) {
  if (status === "pending") {
    return (
      <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs gap-1">
        <Clock className="w-3 h-3" /> Queued
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Running
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1">
        <CheckCircle2 className="w-3 h-3" /> Done
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1" title={error || ""}>
        <XCircle className="w-3 h-3" /> Failed
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge variant="outline" className="text-slate-400 text-xs border-slate-200">
        Cancelled
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}
