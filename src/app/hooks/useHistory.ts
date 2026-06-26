import { useState, useCallback } from "react";
import {
  loadHistory,
  addHistorySession,
  deleteHistorySession,
  type HistorySession,
} from "../utils/history";

export function useHistory() {
  const [sessions, setSessions] = useState<HistorySession[]>(() => loadHistory());

  const add = useCallback((session: HistorySession) => {
    addHistorySession(session);
    setSessions(loadHistory());
  }, []);

  const remove = useCallback((id: string) => {
    deleteHistorySession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const refresh = useCallback(() => {
    setSessions(loadHistory());
  }, []);

  return { sessions, add, remove, refresh };
}
