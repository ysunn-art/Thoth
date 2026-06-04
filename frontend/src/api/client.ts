// Typed client for the Project Thoth FastAPI backend.
// Calls go through the Vite dev proxy (see vite.config.ts) to http://localhost:8000.

const BASE = "/api/v1";
const API_KEY = import.meta.env.VITE_BENCHMARK_API_KEY as string | undefined;

export interface SME {
  sme_id: string;
  name: string;
  specialization: string;
  sub_areas: string[];
  contact_email: string;
  created_at: string;
}

export interface KnowledgeEntry {
  entry_id: string;
  sme_id: string;
  topic: string;
  status: string; // draft | sme_approved | approved | rejected
  content: string;
  created_at: string;
  updated_at: string;
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    ...(extra ?? {}),
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
  };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface SourceRef {
  entry_id: string;
  sme_name: string;
  topic: string;
}

export interface RoutingTarget {
  type: string;
  sme_name: string | null;
  specialization: string;
  reason: string;
}

export interface QueryResponse {
  answer: string;
  grounded: boolean;
  sources: SourceRef[];
  disclaimer: string | null;
  session_id: string;
  response_type: string;
  routed_to: RoutingTarget[] | null;
  timestamp: string;
}

export const api = {
  listSmes: () => get<{ smes: SME[] }>("/smes"),
  listKnowledge: () => get<{ entries: KnowledgeEntry[] }>("/knowledge"),
  query: async (question: string, sessionId: string): Promise<QueryResponse> => {
    const res = await fetch(`${BASE}/query`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ question, session_id: sessionId }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<QueryResponse>;
  },
};

export interface DashboardStats {
  approvedArticles: number;
  smeCount: number;
  pendingReview: number;
}

// Derive the home-screen stat cards from live API data.
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [{ smes }, { entries }] = await Promise.all([
    api.listSmes(),
    api.listKnowledge(),
  ]);
  return {
    smeCount: smes.length,
    approvedArticles: entries.filter((e) => e.status === "approved").length,
    pendingReview: entries.filter(
      (e) => e.status === "draft" || e.status === "sme_approved",
    ).length,
  };
}
