"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Microscope,
  Camera,
  BarChart3,
  History,
  BookOpen,
  CloudRain,
  Bot,
  FileText,
  Settings,
  LogOut,
  ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onLogout?: () => void;
}

export function Sidebar({ onLogout }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/dashboard/detection", icon: Microscope, label: "Leaf Diagnosis" },
    { href: "/dashboard/history", icon: History, label: "Prediction History" },
    { href: "/dashboard/result", icon: BarChart3, label: "AI Diagnostic Result" },
    { href: "/dashboard/library", icon: BookOpen, label: "Disease Library" },
    { href: "/dashboard/weather", icon: CloudRain, label: "Weather Risks" },
    { href: "/dashboard/assistant", icon: Bot, label: "AI Assistant" },
    { href: "/dashboard/reports", icon: FileText, label: "Reports & Exports" },
  ];

  return (
    <aside className="w-64 flex flex-col justify-between p-4 bg-surface border-r border-outline-variant shrink-0 overflow-y-auto">
      <div className="space-y-6">
        {/* Sidebar Header */}
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-lg bg-primary-container text-secondary-container flex items-center justify-center font-bold">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L1 21h22L12 2zm0 3.5L19.5 19h-15L12 5.5z"/>
              <path d="M11 11h2v5h-2z"/>
              <circle cx="12" cy="17.5" r="1"/>
            </svg>
          </div>
          <div>
            <div className="text-headline-sm font-headline-sm font-bold text-primary">
              WheatGuard
            </div>
            <div className="text-label-sm font-label-sm text-outline">
              Enterprise Field v2.4
            </div>
          </div>
        </div>

        {/* Execute Batch Scan CTA Button */}
        <Link
          href="/dashboard/detection"
          className="w-full py-2.5 px-3 rounded-lg bg-primary-container text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 hover:bg-primary transition-all shadow-xs active:scale-[0.99]"
        >
          <ScanLine className="h-5 w-5" />
          <span>Execute Batch Scan</span>
        </Link>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-label-md font-label-md transition-colors",
                  isActive
                    ? "bg-primary text-on-primary font-medium shadow-xs"
                    : "text-on-surface-variant hover:text-primary hover:bg-surface-container"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer User Metadata / Logout */}
      <div className="pt-4 border-t border-outline-variant space-y-2">
        <div className="px-2 py-1 flex items-center justify-between text-label-sm font-label-sm text-outline">
          <span>Crop Season 2025-Q2</span>
          <span className="text-secondary font-semibold">Active Sync</span>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/30 transition-colors text-label-md font-label-md"
        >
          <LogOut className="h-5 w-5" />
          <span>Disconnect Session</span>
        </button>
      </div>
    </aside>
  );
}
