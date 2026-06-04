const BASE = "/api/v1";
const API_KEY = import.meta.env.VITE_BENCHMARK_API_KEY as string | undefined;

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = localStorage.getItem("thoth_token");
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  else if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  return headers;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Interfaces ────────────────────────────────────────────────────

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string;
}

export interface Sources {
  interviews: string[];
  materials: string[];
}

// ── SME ───────────────────────────────────────────────────────────

export interface SMECreate {
  name: string;
  specialization: string;
  sub_areas: string[];
  contact_email: string;
}

export interface SMEUpdate {
  name: string;
  specialization: string;
  sub_areas: string[];
  contact_email: string;
}

export interface SME {
  sme_id: string;
  name: string;
  specialization: string;
  sub_areas: string[];
  contact_email: string;
  created_at: string;
}

export interface SMEListResponse {
  smes: SME[];
}

// ── Interview ─────────────────────────────────────────────────────

export interface InterviewSummary {
  interview_id: string;
  topic: string;
  status: string;
  created_at: string;
}

export interface InterviewResponse {
  interview_id: string;
  sme_id: string;
  topic: string;
  status: string;
  created_at: string;
}

export interface TurnResponse {
  turn_number: number;
  sme_response: string;
  agent_follow_up: string | null;
  timestamp: string;
  usage?: UsageInfo;
}

export interface TurnSummary {
  turn_number: number;
  sme_response: string;
  agent_follow_up: string | null;
  timestamp: string;
}

export interface InterviewTranscript {
  interview_id: string;
  sme_id: string;
  topic: string;
  status: string;
  turns: TurnSummary[];
}

export interface InterviewListResponse {
  interviews: InterviewSummary[];
}

// ── Material ──────────────────────────────────────────────────────

export interface MaterialSummary {
  material_id: string;
  title: string;
  file_type: string;
  status: string;
  created_at: string;
}

export interface MaterialResponse {
  material_id: string;
  sme_id: string;
  title: string;
  file_type: string;
  status: string;
  created_at: string;
  usage?: object;
}

export interface MaterialListResponse {
  materials: MaterialSummary[];
}

// ── Knowledge ─────────────────────────────────────────────────────

export interface SynthesizeRequest {
  interview_ids: string[];
  material_ids: string[];
  topic: string;
}

export interface KnowledgeEntry {
  entry_id: string;
  sme_id: string;
  topic: string;
  status: string;
  content: string;
  sources: Sources;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSynthesizeResponse {
  entry_id: string;
  sme_id: string;
  topic: string;
  status: string;
  content: string;
  sources: Sources;
  created_at: string;
  usage?: UsageInfo;
}

export interface KnowledgeListResponse {
  entries: KnowledgeEntry[];
}

export interface ApproveResponse {
  entry_id: string;
  status: string;
  approved_at: string;
}

export interface AdminApproveResponse {
  entry_id: string;
  status: string;
  admin_approved_at: string;
}

export interface RejectResponse {
  entry_id: string;
  status: string;
  rejected_at: string;
}

// ── Query ─────────────────────────────────────────────────────────

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
  usage: UsageInfo;
}

// ── Dashboard ─────────────────────────────────────────────────────

export interface DashboardStats {
  approvedArticles: number;
  smeCount: number;
  pendingReview: number;
}

// ── Auth ───────────────────────────────────────────────────────────

export interface UserInfo {
  user_id: string;
  email: string;
  is_admin: boolean;
  is_sme: boolean;
  sme_id: string | null;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserInfo;
}

export function setToken(token: string, user: UserInfo) {
  localStorage.setItem("thoth_token", token);
  localStorage.setItem("thoth_user", JSON.stringify(user));
}

export function getToken(): string | null {
  return localStorage.getItem("thoth_token");
}

export function getUser(): UserInfo | null {
  const raw = localStorage.getItem("thoth_user");
  if (!raw) return null;
  try { return JSON.parse(raw) as UserInfo; } catch { return null; }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function logout() {
  localStorage.removeItem("thoth_token");
  localStorage.removeItem("thoth_user");
  clearSmeNameMap();
}

// ── API ───────────────────────────────────────────────────────────

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<TokenResponse> => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `${res.status} ${res.statusText}`);
    }
    const data: TokenResponse = await res.json();
    setToken(data.access_token, data.user);
    return data;
  },
  register: async (email: string, password: string): Promise<UserInfo> => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, is_admin: false, is_sme: false }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<UserInfo>;
  },
  registerAdmin: async (email: string, password: string): Promise<TokenResponse> => {
    const res = await fetch(`${BASE}/auth/register/elevated`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email, password, is_admin: true, is_sme: false }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `${res.status} ${res.statusText}`);
    }
    return api.login(email, password);
  },
  getMe: () => get<UserInfo>("/auth/me"),

  // SMEs
  listSmes: () => get<SMEListResponse>("/smes"),
  getSme: (smeId: string) => get<SME>(`/smes/${smeId}`),
  createSme: (data: SMECreate) => post<SME>("/smes", data),
  updateSme: (smeId: string, data: SMEUpdate) => put<SME>(`/smes/${smeId}`, data),
  deleteSme: (smeId: string) =>
    del<{ status: string; sme_id: string }>(`/smes/${smeId}`),
  linkToSme: (smeId: string) =>
    post<{ status: string; sme_id: string; user_id: string }>(`/smes/${smeId}/link`),

  // Interviews
  createInterview: (smeId: string, topic: string) =>
    post<InterviewResponse>(`/smes/${smeId}/interviews`, { topic }),
  getSmeInterviews: (smeId: string) =>
    get<InterviewListResponse>(`/smes/${smeId}/interviews`),
  getInterview: (interviewId: string) =>
    get<InterviewTranscript>(`/interviews/${interviewId}`),
  completeInterview: (interviewId: string) =>
    post<InterviewResponse>(`/interviews/${interviewId}/complete`),
  submitTurn: (interviewId: string, smeResponse: string) =>
    post<TurnResponse>(`/interviews/${interviewId}/turns`, {
      sme_response: smeResponse,
    }),

  // Materials
  uploadMaterial: async (
    smeId: string,
    file: File,
    title: string,
    description?: string,
  ): Promise<MaterialResponse> => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    if (description) form.append("description", description);
    const headers: Record<string, string> = {};
    const token = localStorage.getItem("thoth_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    else if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    const res = await fetch(`${BASE}/smes/${smeId}/materials`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<MaterialResponse>;
  },
  listMaterials: (smeId: string) =>
    get<MaterialListResponse>(`/smes/${smeId}/materials`),

  // Knowledge
  synthesizeKnowledge: (smeId: string, data: SynthesizeRequest) =>
    post<KnowledgeSynthesizeResponse>(
      `/smes/${smeId}/knowledge/synthesize`,
      data,
    ),
  listKnowledge: (status?: string) =>
    get<KnowledgeListResponse>(
      `/knowledge${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  getKnowledgeById: (entryId: string) =>
    get<KnowledgeEntry>(`/knowledge/${entryId}`),
  updateKnowledge: (entryId: string, content: string) =>
    put<KnowledgeEntry>(`/knowledge/${entryId}`, { content }),
  approveEntry: (entryId: string) =>
    post<ApproveResponse>(`/knowledge/${entryId}/approve`),
  adminApproveEntry: (entryId: string) =>
    post<AdminApproveResponse>(`/knowledge/${entryId}/admin-approve`),
  rejectEntry: (entryId: string, reason?: string) =>
    post<RejectResponse>(`/knowledge/${entryId}/reject`, { reason }),

  // Query
  query: async (question: string, sessionId: string): Promise<QueryResponse> => {
    const res = await fetch(`${BASE}/query`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ question, session_id: sessionId }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<QueryResponse>;
  },

  // System
  purge: () => post<{ status: string; message: string }>("/system/purge"),
  reset: () => post<{ status: string; message: string }>("/system/reset"),

  // Sessions
  listSessions: () =>
    get<{ id: string; title: string; updated_at: string }[]>("/sessions"),
  getSession: (sessionId: string) =>
    get<{ id: string; title: string; messages: { id: string; session_id: string; role: string; content: string; turn_number: number; created_at: string }[] }>(
      `/sessions/${sessionId}`,
    ),
};

// ── SME name → ID lookup ──────────────────────────────────────────

let _smeNameMap: Record<string, string> | null = null;

export async function getSmeNameMap(): Promise<Record<string, string>> {
  if (_smeNameMap) return _smeNameMap;
  const { smes } = await api.listSmes();
  _smeNameMap = Object.fromEntries(smes.map((s) => [s.name, s.sme_id]));
  return _smeNameMap;
}

export function clearSmeNameMap() {
  _smeNameMap = null;
}

// ── Dashboard stats ───────────────────────────────────────────────

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
