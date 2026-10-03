"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  History,
  Home,
  Leaf,
  Microscope,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_LINKS = [
  { href: "/",                     label: "Home",      icon: Home       },
  { href: "/dashboard",           label: "Dashboard", icon: Home       },
  { href: "/dashboard/detection", label: "Analyze",   icon: Microscope },
  { href: "/dashboard/history",   label: "History",   icon: History    },
  { href: "/dashboard/result",    label: "Analytics", icon: BarChart3  },
  { href: "/dashboard/library",   label: "Diseases",  icon: BookOpen   },
  { href: "/dashboard/assistant", label: "Assistant", icon: Info       },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800">
      {/* Logo */}
      <div className="flex h-16 flex-shrink-0 items-center gap-2.5 px-5 border-b border-gray-200 dark:border-zinc-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600 text-white">
          <Leaf className="h-4 w-4" />
        </div>
        <span className="font-bold text-gray-900 dark:text-zinc-100">
          WheatGuard<span className="text-green-600"> AI</span>
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" aria-label="Sidebar navigation">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              )}
            >
              <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-zinc-500")} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer badge */}
      <div className="flex-shrink-0 border-t border-gray-200 px-4 py-4 dark:border-zinc-800">
        <p className="text-[10px] leading-tight text-gray-400 dark:text-zinc-600">
          AI predictions only.<br />
          Consult an expert before treatment.
        </p>
      </div>
    </aside>
  );
}
