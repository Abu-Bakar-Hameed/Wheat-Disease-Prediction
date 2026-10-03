"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { fetchUserProfile, type PredictionResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type Role      = "guest" | "user" | "admin";
export type UserTab   = "dashboard" | "detection" | "result" | "history" | "library" | "weather" | "assistant" | "reports" | "settings";
export type AdminTab  = "dashboard" | "crops" | "users" | "diagnosis" | "diseases" | "logs" | "settings";
export type Modal     = "logout" | "disease" | null;

interface AppState {
  role:        Role;
  userTab:     UserTab;
  adminTab:    AdminTab;
  modal:       Modal;
  /** Last successful prediction — shared between Detection, Camera → Result */
  lastResult:  PredictionResponse | null;
  /** Blob URL of the image that was submitted (for display in ResultView) */
  lastImageUrl: string | null;
  /** Which tab is active in DiagnosticView: "upload" | "camera" */
  diagnosticTab: "upload" | "camera";
  /** Current user's avatar URL — shared between UserTopBar and ProfileModal */
  avatarUrl:   string | null;
  setRole:      (r: Role)      => void;
  setUserTab:   (t: UserTab)   => void;
  setAdminTab:  (t: AdminTab)  => void;
  openModal:    (m: Modal)     => void;
  closeModal:   ()             => void;
  setLastResult:(r: PredictionResponse | null, imageUrl?: string) => void;
  setDiagnosticTab: (t: "upload" | "camera") => void;
  setAvatarUrl: (url: string | null) => void;
}

const Ctx = createContext<AppState | null>(null);

const ROLE_KEY = "wg_role";
const AVATAR_KEY = "wg_avatar_url";

/** Mirror the avatar URL into localStorage so a refresh can paint it instantly
 *  instead of waiting on the profile request. */
function storeAvatarUrl(url: string | null) {
  try {
    if (url) localStorage.setItem(AVATAR_KEY, url);
    else localStorage.removeItem(AVATAR_KEY);
  } catch {
    /* ignore */
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [role,         setRoleRaw]    = useState<Role>("guest");
  const [userTab,      setUserTabRaw] = useState<UserTab>("dashboard");
  const [adminTab,     setAdminTabRaw]= useState<AdminTab>("dashboard");
  const [modal,        setModal]      = useState<Modal>(null);
  const [lastResult,   setLastResultRaw] = useState<PredictionResponse | null>(null);
  const [lastImageUrl, setLastImageUrl]  = useState<string | null>(null);
  const [diagnosticTab, setDiagnosticTabRaw] = useState<"upload" | "camera">("upload");
  const [avatarUrl,    setAvatarUrlRaw]  = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    const isStaticAdmin =
      Boolean(user) &&
      String(user?.email ?? "").trim().toLowerCase() === "sw@gmail.com" &&
      String(user?.role ?? user?.user_metadata?.role ?? user?.app_metadata?.role ?? "user").toLowerCase() === "admin";

    const roleFromUser = !user ? "guest" : isStaticAdmin ? "admin" : "user";

    queueMicrotask(() => {
      setRoleRaw(roleFromUser);
      try {
        if (roleFromUser === "guest") localStorage.removeItem(ROLE_KEY);
        else localStorage.setItem(ROLE_KEY, roleFromUser);
      } catch {
        /* ignore */
      }
    });
  }, [user, authLoading]);

  // Restore the saved avatar. `avatarUrl` is plain React state initialised to
  // null, so without this the top bar falls back to the user's initials on every
  // refresh even though the URL is stored on their profile. Paint from cache
  // first, then confirm against the server (the source of truth).
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      queueMicrotask(() => {
        setAvatarUrlRaw(null);
        storeAvatarUrl(null);
      });
      return;
    }

    let cancelled = false;
    try {
      const cached = localStorage.getItem(AVATAR_KEY);
      if (cached) {
        queueMicrotask(() => {
          if (!cancelled) setAvatarUrlRaw(cached);
        });
      }
    } catch {
      /* ignore */
    }

    fetchUserProfile()
      .then((p) => {
        if (cancelled) return;
        // fetchUserProfile falls back to { id: "unknown" } when the endpoint
        // failed — keep the cached URL rather than wiping a valid avatar.
        if (p.id === "unknown" && !p.avatar_url) return;
        const url = p.avatar_url ?? null;
        setAvatarUrlRaw(url);
        storeAvatarUrl(url);
      })
      .catch(() => {
        /* keep whatever is cached */
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const setRole = useCallback((r: Role) => {
    setRoleRaw(r);
    try {
      if (r === "guest") localStorage.removeItem(ROLE_KEY);
      else localStorage.setItem(ROLE_KEY, r);
    } catch {
      /* ignore */
    }
  }, []);

  const setUserTab = useCallback((t: UserTab) => setUserTabRaw(t), []);
  const setAdminTab = useCallback((t: AdminTab) => setAdminTabRaw(t), []);
  const openModal = useCallback((m: Modal) => setModal(m), []);
  const closeModal = useCallback(() => setModal(null), []);

  const setLastResult = useCallback((r: PredictionResponse | null, imageUrl?: string) => {
    setLastResultRaw(r);
    if (imageUrl !== undefined) setLastImageUrl(imageUrl);
  }, []);

  const setDiagnosticTab = useCallback((t: "upload" | "camera") => setDiagnosticTabRaw(t), []);
  const setAvatarUrl = useCallback((url: string | null) => {
    setAvatarUrlRaw(url);
    storeAvatarUrl(url);
  }, []);

  return (
    <Ctx.Provider value={{
      role, userTab, adminTab, modal,
      lastResult, lastImageUrl,
      diagnosticTab,
      avatarUrl,
      setRole, setUserTab, setAdminTab,
      openModal, closeModal, setLastResult,
      setDiagnosticTab,
      setAvatarUrl,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppStateProvider");
  return ctx;
}
