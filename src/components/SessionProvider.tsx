"use client";

import { createContext, useContext, useMemo } from "react";
import { can as canFn, type Permission } from "@/lib/permissions";
import type { User } from "@/lib/types";

interface SessionValue {
  user: User;
  isSuper: boolean;
  /** A commission user: makes cases, sees only their own, and is paid commission. */
  isCommission: boolean;
  /** For the super admin: new cases and edits waiting for approval. */
  reviews: number;
  /** The Finance tab shows: the super admin, or an admin allowed to see their own account. */
  financeVisible: boolean;
  can: (perm: Permission) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  user,
  financeVisible = false,
  reviews = 0,
  children,
}: {
  user: User;
  financeVisible?: boolean;
  reviews?: number;
  children: React.ReactNode;
}) {
  const value = useMemo<SessionValue>(
    () => ({
      user,
      isSuper: user.role === "superadmin",
      isCommission: user.role === "commission",
      reviews,
      financeVisible,
      can: (perm) => canFn(user, perm),
    }),
    [user, financeVisible, reviews],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
