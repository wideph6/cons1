"use client";

import {
  Activity,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { ToastProvider, cx } from "@/components/ui";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, isSuper, can } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const nav: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard, show: true },
    { href: "/admin/files", label: "File manager", icon: FolderTree, show: true },
    { href: "/admin/domains", label: "Domains", icon: Globe, show: true },
    { href: "/admin/search", label: "Search by date", icon: Search, show: isSuper || can("search") },
    { href: "/admin/activity", label: "Activity", icon: Activity, show: isSuper || can("view_activity") },
    { href: "/admin/users", label: "Users", icon: Users, show: isSuper },
    { href: "/admin/account", label: "My account", icon: UserCog, show: true },
  ];

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-800 text-ink-200">
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-ink-700">
        <span className="inline-flex size-7 items-center justify-center rounded bg-teal-600 text-white font-semibold text-sm">P</span>
        <div className="leading-tight">
          <div className="text-white font-semibold text-[14px]">PDF Link Manager</div>
          <div className="text-[11px] text-ink-300">download links across your domains</div>
        </div>
        <button className="ml-auto lg:hidden text-ink-300 hover:text-white" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav
          .filter((n) => n.show)
          .map((n) => {
            const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={cx(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] transition-colors",
                  active ? "bg-ink-950 text-white font-medium" : "text-ink-200 hover:bg-ink-700 hover:text-white",
                )}
              >
                <n.icon className="size-4 shrink-0" />
                {n.label}
              </Link>
            );
          })}
      </nav>
      <div className="border-t border-ink-700 p-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-full bg-ink-600 text-white flex items-center justify-center text-sm font-medium uppercase">
            {(user.name || user.email).slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-white text-[13px] font-medium truncate">{user.name || user.email}</div>
            <div className="text-[11.5px] text-ink-300 truncate">{isSuper ? "Super admin" : "Admin"}</div>
          </div>
          <button
            onClick={signOut}
            className="text-ink-300 hover:text-white p-1 rounded"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block sticky top-0 h-screen">{sidebar}</aside>
        {open ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-ink-950/60" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[260px] shadow-2xl">{sidebar}</div>
          </div>
        ) : null}
        <div className="flex min-h-screen flex-col min-w-0">
          <header className="lg:hidden flex items-center gap-3 h-12 px-3 bg-ink-800 text-white">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-1">
              <Menu className="size-5" />
            </button>
            <span className="font-semibold">PDF Link Manager</span>
          </header>
          <main className="flex-1 min-w-0 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
