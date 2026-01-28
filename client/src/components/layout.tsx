import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Search, 
  Inbox, 
  BarChart3, 
  MessageSquareText, 
  Sparkles, 
  Settings,
  Bell,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { icon: LayoutDashboard, label: "Home", href: "/" },
    { icon: Search, label: "Search", href: "/search" },
    { icon: Inbox, label: "Inbox", href: "/inbox" },
  ];

  const metricItems = [
    { icon: BarChart3, label: "Industry", href: "/industry" },
    { icon: MessageSquareText, label: "Topic", href: "/topic" },
    { icon: Sparkles, label: "Model", href: "/model" },
    { icon: Settings, label: "Citation", href: "/citation" },
    { icon: Sparkles, label: "Improve", href: "/improve" },
  ];

  return (
    <div className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col h-screen fixed left-0 top-0 z-10">
      <div className="p-4 h-14 flex items-center border-b border-sidebar-border/40">
        <div className="flex items-center gap-2 font-semibold text-sidebar-primary-foreground">
          <div className="w-6 h-6 bg-sidebar-primary-foreground text-sidebar-primary flex items-center justify-center rounded text-xs font-bold">R</div>
          <span>Rho</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
        </div>
      </div>

      <div className="p-2 space-y-1">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              location === item.href 
                ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                : "hover:bg-sidebar-accent/50 text-muted-foreground hover:text-sidebar-foreground"
            )}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </div>
          </Link>
        ))}
      </div>

      <div className="px-4 pt-6 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Metrics
      </div>
      <div className="p-2 space-y-1">
        {metricItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              location === item.href 
                ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                : "hover:bg-sidebar-accent/50 text-muted-foreground hover:text-sidebar-foreground"
            )}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className="h-14 border-b border-border bg-background flex items-center px-6 justify-between sticky top-0 z-0 pl-72">
      <div className="text-sm text-muted-foreground">
        Rho &gt; <span className="text-foreground">Home</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-secondary/50 rounded-md p-1">
          <button className="px-3 py-1 text-xs font-medium bg-background rounded-sm shadow-sm">Last 24 hours</button>
          <button className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">Last 7 days</button>
          <button className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">Last 30 days</button>
        </div>
        <button className="p-2 hover:bg-secondary rounded-full">
            <Bell className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-chart-1/30">
      <Sidebar />
      <Header />
      <main className="pl-64 pt-6 p-8 max-w-[1600px] mx-auto">
        {children}
      </main>
    </div>
  );
}
