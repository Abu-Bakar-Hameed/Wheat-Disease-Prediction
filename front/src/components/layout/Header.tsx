"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ScanLine, User } from "lucide-react";

export type UserRole = "guest" | "user" | "admin";

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
}

export function Header({ currentRole, onRoleChange }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);

  const notifications = [
    {
      id: 1,
      type: "error",
      title: "High Risk: Yellow Rust",
      message: "Sector 4-B humidity crossed 78%. Spore dispersion index elevated.",
      time: "10m ago",
    },
    {
      id: 2,
      type: "success",
      title: "Batch Scan Completed",
      message: "Field Block North: 64 leaves processed. 92% healthy wheat status.",
      time: "42m ago",
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full h-16 px-gutter-desktop flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest shadow-sm">
        {/* Left Brand & Status */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center text-secondary-container shadow-xs">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.5 12c-2.483 0-4.5 2.015-4.5 4.5s2.017 4.5 4.5 4.5 4.5-2.015 4.5-4.5-2.017-4.5-4.5-4.5zm2.5 5h-2v2h-1v-2h-2v-1h2v-2h1v2h2v1zm-6.527 4.593c-1.108 1.086-2.275 2.219-3.473 3.407-6.43-6.381-12-11.147-12-15.808 0-4.005 3.098-6.192 6.281-6.192 2.197 0 4.434 1.042 5.719 3.248 1.279-2.195 3.521-3.238 5.726-3.238 3.177 0 6.274 2.171 6.274 6.182 0 .746-.156 1.496-.423 2.253-.527-.427-1.124-.768-1.769-1.014.122-.425.192-.839.192-1.239 0-2.873-2.216-4.182-4.274-4.182-3.257 0-4.976 3.475-5.726 5.021-.747-1.54-2.484-5.03-5.72-5.031-2.315-.001-4.281 1.516-4.281 4.192 0 3.442 4.742 7.85 10 13l2.109-2.064c.376.557.839 1.048 1.364 1.465z"/>
              </svg>
            </div>
            <div>
              <span className="text-headline-sm font-headline-sm font-bold tracking-tight text-primary">
                WheatGuard AI
              </span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded-full text-label-sm font-label-sm bg-secondary-container text-on-secondary-container">
                v2.4 Core
              </span>
            </div>
          </Link>
          
          {/* Live Status Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-outline-variant text-label-sm font-label-sm">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-on-surface-variant font-code-tabular text-code-tabular">
              Vision AI v2.4 Online - 99.8% Uptime
            </span>
          </div>
        </div>

        {/* Center: Role Switcher - simplified: only Farmer Panel (authenticated users) */}
        <div className="flex items-center bg-surface-container p-1 rounded-lg border border-outline-variant">
          <button
            onClick={() => onRoleChange("user")}
            className={`px-3 py-1 rounded-md text-label-md font-label-md transition-all duration-150 ${
              currentRole === "user"
                ? "bg-primary-container text-on-primary font-semibold shadow-xs"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            Farmer Panel
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Notification Icon */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors duration-150 relative"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-surface-container-lowest" />
            </button>
          </div>

          {/* Quick Scan Button */}
          {currentRole === "user" && (
            <Link
              href="/dashboard/detection"
              className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary-container text-on-primary text-label-md font-label-md font-semibold hover:bg-primary transition-colors duration-150 active:scale-[0.99] shadow-xs"
            >
              <ScanLine className="h-4 w-4" />
              <span>Scan Leaf</span>
            </Link>
          )}

          {/* Profile Avatar */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-outline-variant">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-label-md ring-2 ring-secondary-container">
              {currentRole === "guest" ? <User className="h-4 w-4" /> : "AT"}
            </div>
            <div className="hidden xl:block text-left">
              <div className="text-label-md font-label-md font-semibold text-on-surface">
                {currentRole === "guest" ? "Guest User" : "Dr. Aris Thorne"}
              </div>
              <div className="text-body-sm font-body-sm text-outline">
                {currentRole === "admin" ? "Lead Agronomist" : currentRole === "user" ? "Farmer" : "Visitor"}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Notification Flyout */}
      {showNotifications && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowNotifications(false)}
          />
          <div className="fixed top-16 right-6 w-80 sm:w-96 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg z-50 p-4">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <span className="text-headline-sm font-headline-sm text-on-surface">
                  Field Telemetry Alerts
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container text-label-sm font-label-sm font-semibold">
                {notifications.length} New
              </span>
            </div>
            
            <div className="divide-y divide-outline-variant/40 mt-2 max-h-72 overflow-y-auto">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="py-2.5 px-1 hover:bg-surface-container rounded-lg cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-label-sm font-label-sm font-bold flex items-center gap-1 ${
                      notif.type === "error" ? "text-error" : "text-secondary"
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        notif.type === "error" ? "bg-error" : "bg-secondary"
                      }`} />
                      {notif.title}
                    </span>
                    <span className="text-body-sm font-body-sm text-outline">
                      {notif.time}
                    </span>
                  </div>
                  <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
                    {notif.message}
                  </p>
                </div>
              ))}
            </div>
            
            <div className="pt-3 border-t border-outline-variant text-center">
              <button
                onClick={() => setShowNotifications(false)}
                className="text-label-sm font-label-sm text-secondary font-semibold hover:underline"
              >
                Mark all as read
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
