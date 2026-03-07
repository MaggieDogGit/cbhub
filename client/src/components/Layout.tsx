import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Building2, Globe, MapPin, Bot, Database, Menu, X, Search, MessageSquare
} from "lucide-react";
import { Input } from "@/components/ui/input";

const navItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "CB Providers (groups)", path: "/providers", icon: Building2 },
  { name: "CB Legal Entities", path: "/legal-entities", icon: Building2 },
  { name: "CLS", path: "/cls", icon: Globe },
  { name: "Currencies", path: "/currencies", icon: Globe },
  { name: "Market Coverage", path: "/market-coverage", icon: MapPin },
  { name: "Research Assistant", path: "/research", icon: Bot },
  { name: "AI Agent", path: "/agent", icon: MessageSquare },
  { name: "Database Admin", path: "/admin", icon: Database },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [location, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:inset-auto`}>
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">CB</div>
            <div>
              <div className="font-bold text-white text-sm">CB Providers</div>
              <div className="text-slate-400 text-xs">Intelligence Platform</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setSidebarOpen(false)}
                data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
          Correspondent Banking Intelligence
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 lg:px-8 py-4 flex items-center gap-4">
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-sidebar-toggle"
          >
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search banks, BICs, currencies..."
                className="pl-9 bg-slate-50 border-slate-200 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    navigate(`/providers?search=${encodeURIComponent(searchQuery)}`);
                    setSearchQuery("");
                  }
                }}
                data-testid="input-global-search"
              />
            </div>
          </div>
          <div className="ml-auto text-sm text-slate-500 hidden sm:block">
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
