"use client";

import { createContext, useContext, useMemo } from "react";
import { can as canFn, type Permission } from "@/lib/permissions";
import type { User } from "@/lib/types";

interface SessionValue {
  user: User;
  isSuper: boolean;
  /** The Finance tab shows: the super admin, or an admin allowed to see their own account. */
  financeVisible: boolean;
  can: (perm: Permission) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  user,
  financeVisible = false,
  children,
}: {
  user: User;
  financeVisible?: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo<SessionValue>(
    () => ({ user, isSuper: user.role === "superadmin", financeVisible, can: (perm) => canFn(user, perm) }),
    [user, financeVisible],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
