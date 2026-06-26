import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, reload, type User } from "firebase/auth";
import { auth } from "../firebase/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? { ...firebaseUser } : null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /**
   * Call this after any Firebase profile update (displayName, photoURL, etc.)
   * to force a re-render with the latest user object across the whole tree.
   */
  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      await reload(auth.currentUser);
      // Spread to produce a new object reference so React re-renders consumers
      setUser({ ...auth.currentUser });
    } catch {
      // reload can fail when offline — silently ignore
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext);
}
