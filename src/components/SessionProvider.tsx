"use client";

import { createContext, useContext, useMemo } from "react";
import { can as canFn, type Permission } from "@/lib/permissions";
import type { User } from "@/lib/types";

interface SessionValue {
  user: User;
  isSuper: boolean;
  can: (perm: Permission) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const value = useMemo<SessionValue>(
    () => ({ user, isSuper: user.role === "superadmin", can: (perm) => canFn(user, perm) }),
    [user],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
