import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Building2, Users, Swords, Bot, Database,
  Menu, Search, MessageSquare, LogOut, BookOpen, Network, ClipboardEdit,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";

type NavItem = { name: string; path: string; icon: React.ComponentType<{ className?: string }> };

const MAIN_NAV: NavItem[] = [
  { name: "Dashboard",   path: "/",            icon: LayoutDashboard },
  { name: "Competition", path: "/competition",  icon: Swords },
];

const ENTITY_NAV: NavItem[] = [
  { name: "Banking Groups",  path: "/banking-groups", icon: Building2 },
  { name: "Legal Entities",  path: "/legal-entities", icon: Users },
];

const RESEARCH_NAV: NavItem[] = [
  { name: "Research Assistant", path: "/research",  icon: Bot },
  { name: "AI Agent",           path: "/agent",      icon: MessageSquare },
  { name: "FMI Research",       path: "/fmi",        icon: Network },
  { name: "Data Sources",       path: "/sources",    icon: BookOpen },
];

const TOOLS_NAV: NavItem[] = [
  { name: "Registry Editor",  path: "/registry", icon: ClipboardEdit },
  { name: "Database Admin",   path: "/admin",    icon: Database },
];

function NavSection({ label, items, location, onNavigate }: {
  label?: string;
  items: NavItem[];
  location: string;
  onNavigate: () => void;
}) {
  return (
    <div>
      {label && (
        <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 select-none">
          {label}
        </p>
      )}
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
        return (
          <Link
            key={item.path}
            href={item.path}
            onClick={onNavigate}
            data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {item.name}
          </Link>
        );
      })}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [location, navigate] = useLocation();
  const { logout } = useAuth();

  const closeNav = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-background flex">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-slate-900 text-white flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static lg:inset-auto`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm shrink-0">
              CB
            </div>
            <div>
              <div className="font-bold text-white text-sm leading-tight">CB Intelligence</div>
              <div className="text-slate-400 text-xs">Correspondent Banking</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <NavSection items={MAIN_NAV} location={location} onNavigate={closeNav} />
          <NavSection label="Entities" items={ENTITY_NAV} location={location} onNavigate={closeNav} />
          <NavSection label="Research" items={RESEARCH_NAV} location={location} onNavigate={closeNav} />
          <NavSection label="Tools" items={TOOLS_NAV} location={location} onNavigate={closeNav} />
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Intelligence Platform</span>
          <button
            onClick={logout}
            data-testid="button-logout"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeNav}
        />
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
                placeholder="Search banking groups, entities, BICs…"
                className="pl-9 bg-slate-50 border-slate-200 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    navigate(`/banking-groups?search=${encodeURIComponent(searchQuery)}`);
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
