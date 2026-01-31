import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Bell,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { icon: LayoutDashboard, label: "Home", href: "/" },
  ];

  return (
    <div className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col h-screen fixed left-0 top-0 z-10">
      <div className="p-4 h-14 flex items-center border-b border-sidebar-border/40">
        <div className="flex items-center gap-3 font-semibold text-sidebar-primary-foreground">
          <img
            src="/profound-wordmark.png"
            alt="Profound"
            className="h-6 w-auto opacity-95"
            data-testid="img-profound-wordmark"
          />
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
    </div>
  );
}

export function Header() {
  return (
    <header className="h-14 border-b border-border bg-background flex items-center px-6 justify-between sticky top-0 z-0 pl-72">
      <div className="text-sm text-muted-foreground">
        Profound &gt; <span className="text-foreground">Home</span>
      </div>
      <div className="flex items-center gap-4">
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
