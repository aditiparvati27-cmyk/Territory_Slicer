import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Database,
  Bell,
  LayoutGrid,
  Menu,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { icon: LayoutDashboard, label: "Home", href: "/" },
  { icon: Database, label: "Upload Dataset", href: "/dataset" },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();

  return (
    <>
      <div className="p-4 h-14 flex items-center border-b border-sidebar-border/40">
        <div className="flex items-center gap-2 font-semibold text-sidebar-primary-foreground">
          <LayoutGrid className="w-5 h-5 text-chart-1" />
          <span className="text-sm tracking-tight">Territory Slicer</span>
        </div>
      </div>

      <div className="p-2 space-y-1">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                location === item.href
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50 text-muted-foreground hover:text-sidebar-foreground"
              )}
              onClick={onNavigate}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function DesktopSidebar() {
  return (
    <div className="hidden md:flex w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex-col h-screen fixed left-0 top-0 z-10">
      <SidebarContent />
    </div>
  );
}

function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="md:hidden inline-flex items-center justify-center p-2 rounded-md hover:bg-secondary"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

const breadcrumbMap: Record<string, string> = {
  "/": "Home",
  "/dataset": "Upload Dataset",
};

export function Header() {
  const [location] = useLocation();
  const pageLabel = breadcrumbMap[location] || "Home";

  return (
    <header className="h-14 border-b border-border bg-background flex items-center px-4 md:px-6 justify-between sticky top-0 z-20 md:pl-72">
      <div className="flex items-center gap-3">
        <MobileSidebar />
        <div className="text-sm text-muted-foreground">
          <span className="hidden sm:inline">Territory Slicer &gt; </span>
          <span className="text-foreground">{pageLabel}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-secondary rounded-full">
          <Bell className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}

// Keep Sidebar export for backwards compat but it's only used in Layout
export function Sidebar() {
  return <DesktopSidebar />;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-chart-1/30">
      <DesktopSidebar />
      <Header />
      <main className="md:pl-64 pt-4 md:pt-6 px-4 md:px-8 pb-8 max-w-[1600px] mx-auto">
        {children}
      </main>
    </div>
  );
}
