const HISTORY_KEY = "interviewai_history";

export interface HistorySession {
  id: string;
  role: string;
  level: string;
  difficulty: string;
  type: string;
  questionCount: number;
  date: string;
  questions: Array<{
    question: string;
    answer: string;
    difficulty: string;
    category: string;
  }>;
}

export function loadHistory(): HistorySession[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistorySession[];
  } catch {
    return [];
  }
}

export function saveHistory(sessions: HistorySession[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions));
  } catch {
    // storage quota exceeded — ignore
  }
}

export function addHistorySession(session: HistorySession): void {
  const existing = loadHistory();
  saveHistory([session, ...existing]);
}

export function deleteHistorySession(id: string): void {
  const existing = loadHistory();
  saveHistory(existing.filter((s) => s.id !== id));
}
