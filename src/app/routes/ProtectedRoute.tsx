import React from "react";
import { useAuthContext } from "../context/AuthContext";

interface Props {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

export default function ProtectedRoute({ children, fallback }: Props) {
  const { user, loading } = useAuthContext();
  if (loading) return null;
  return user ? <>{children}</> : <>{fallback}</>;
}
