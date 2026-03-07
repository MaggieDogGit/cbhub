import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Providers from "@/pages/Providers";
import LegalEntities from "@/pages/LegalEntities";
import CLS from "@/pages/CLS";
import Currencies from "@/pages/Currencies";
import MarketCoverage from "@/pages/MarketCoverage";
import ResearchAssistant from "@/pages/ResearchAssistant";
import AgentChat from "@/pages/AgentChat";
import DatabaseAdmin from "@/pages/DatabaseAdmin";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/providers" component={Providers} />
        <Route path="/legal-entities" component={LegalEntities} />
        <Route path="/cls" component={CLS} />
        <Route path="/currencies" component={Currencies} />
        <Route path="/market-coverage" component={MarketCoverage} />
        <Route path="/research" component={ResearchAssistant} />
        <Route path="/agent" component={AgentChat} />
        <Route path="/admin" component={DatabaseAdmin} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
