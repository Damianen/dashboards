"use client";

import {
  Inbox,
  LayoutDashboard,
  PiggyBank,
  ReceiptText,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto grid max-w-screen-sm grid-cols-5">
        {tabs.map(({ href, label, icon: Icon }) => {
          // "/" matches only itself; every other path is a prefix match.
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs transition-colors duration-200 active:scale-95",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "absolute top-0 h-0.5 w-8 rounded-full bg-primary transition-all duration-300",
                  active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                )}
                aria-hidden
              />
              <Icon
                className={cn(
                  "size-5 transition-transform duration-200",
                  active && "-translate-y-px scale-110",
                )}
                aria-hidden
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
