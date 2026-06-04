import { api } from "./client";

const STORAGE_PREFIX = "thoth_chat_sessions";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  responseType?: string;
  timestamp?: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  lastMessage: string;
  updatedAt: number;
  messages: ChatMessage[];
}

function getStorageKey(): string {
  try {
    const raw = localStorage.getItem("thoth_user");
    if (raw) {
      const user = JSON.parse(raw);
      return `${STORAGE_PREFIX}_${user.user_id ?? "anon"}`;
    }
  } catch {}
  return `${STORAGE_PREFIX}_anon`;
}

// ── Local storage CRUD ───────────────────────────────────────────

export function getSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getSession(id: string): ChatSession | null {
  return getSessions().find((s) => s.id === id) ?? null;
}

export function saveSession(session: ChatSession): void {
  const key = getStorageKey();
  const sessions = getSessions().filter((s) => s.id !== session.id);
  sessions.unshift(session);
  if (sessions.length > 50) sessions.length = 50;
  localStorage.setItem(key, JSON.stringify(sessions));
}

export function deleteSession(id: string): void {
  const key = getStorageKey();
  const sessions = getSessions().filter((s) => s.id !== id);
  localStorage.setItem(key, JSON.stringify(sessions));
}

export function clearAllSessions(): void {
  localStorage.removeItem(getStorageKey());
}

export function generateSessionId(): string {
  return `sess_${Math.random().toString(36).slice(2, 10)}`;
}

export function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// ── API-first session loading ─────────────────────────────────────

export async function fetchSessions(): Promise<ChatSession[]> {
  try {
    const list = await api.listSessions();
    return list.map((s) => ({
      id: s.id,
      userId: "",
      title: s.title || "Untitled",
      lastMessage: "",
      updatedAt: new Date(s.updated_at).getTime(),
      messages: [],
    }));
  } catch {
    return getSessions();
  }
}

export async function fetchSessionMessages(
  sessionId: string,
): Promise<ChatMessage[]> {
  // Try API first
  try {
    const detail = await api.getSession(sessionId);
    return detail.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  } catch {
    // Fallback to localStorage
    const local = getSession(sessionId);
    return local?.messages ?? [];
  }
}
