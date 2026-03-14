import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Competition from "@/pages/Competition";
import Providers from "@/pages/Providers";
import LegalEntities from "@/pages/LegalEntities";
import CLS from "@/pages/CLS";
import Currencies from "@/pages/Currencies";
import MarketCoverage from "@/pages/MarketCoverage";
import ResearchAssistant from "@/pages/ResearchAssistant";
import AgentChat from "@/pages/AgentChat";
import DatabaseAdmin from "@/pages/DatabaseAdmin";
import Sources from "@/pages/Sources";
import Coverage from "@/pages/Coverage";
import FmiManagement from "@/pages/FmiManagement";
import FmiProfiles from "@/pages/FmiProfiles";
import FmiProfileDetail from "@/pages/FmiProfileDetail";
import Registry from "@/pages/Registry";
import GeoReference from "@/pages/GeoReference";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/useAuth";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/competition" component={Competition} />
        {/* Banking Groups — canonical route; /providers kept for backward compat */}
        <Route path="/banking-groups" component={Providers} />
        <Route path="/providers">
          <Redirect to="/banking-groups" />
        </Route>
        <Route path="/legal-entities" component={LegalEntities} />
        <Route path="/fmis" component={FmiProfiles} />
        <Route path="/fmis/:id" component={FmiProfileDetail} />
        <Route path="/fmi" component={FmiManagement} />
        <Route path="/cls" component={CLS} />
        <Route path="/currencies" component={Currencies} />
        <Route path="/market-coverage" component={MarketCoverage} />
        <Route path="/research" component={ResearchAssistant} />
        <Route path="/agent" component={AgentChat} />
        <Route path="/sources" component={Sources} />
        <Route path="/coverage" component={Coverage} />
        <Route path="/admin" component={DatabaseAdmin} />
        <Route path="/registry" component={Registry} />
        <Route path="/geo-reference" component={GeoReference} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthGate() {
  const { authenticated, isLoading, refetch } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!authenticated) {
    return <Login onLogin={refetch} />;
  }

  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthGate />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
