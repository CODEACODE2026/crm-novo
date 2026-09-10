import { buildApiUrl } from './api';

export type ClientStatus = 'ATIVO' | 'INATIVO' | 'CANCELADO';

export interface Plan {
  id: string;
  name: string;
  durationMonths: number;
  defaultValue: string;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string | null;
  reference: string;
  planId: string;
  recurringValue: string;
  dueDate: string;
  billingNoticeDays: number;
  notes: string | null;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
  plan: Plan;
  events?: ClientEvent[];
  statusHistory?: ClientStatusHistory[];
}

export interface ClientEvent {
  id: string;
  type: 'CLIENT_CREATED' | 'CLIENT_UPDATED' | 'STATUS_CHANGED';
  title: string;
  description: string | null;
  createdAt: string;
}

export interface ClientStatusHistory {
  id: string;
  previousStatus: ClientStatus;
  newStatus: ClientStatus;
  reason: string | null;
  createdAt: string;
}

export interface PaginatedClients {
  items: Client[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ClientPayload {
  name: string;
  phone: string;
  email?: string | undefined;
  reference: string;
  planId: string;
  recurringValue: number;
  dueDate: string;
  billingNoticeDays: number;
  notes?: string | undefined;
}

export interface PlanPayload {
  name: string;
  durationMonths: number;
  defaultValue: number;
  active?: boolean | undefined;
}

export interface ClientListFilters {
  search?: string | undefined;
  status?: ClientStatus | '' | undefined;
  planId?: string | undefined;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 401) {
    window.location.assign('/login');
    throw new Error('Nao autenticado.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Nao foi possivel concluir a operacao.');
  }

  return (await response.json()) as T;
}

export function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value));
}

export function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function listPlans() {
  return apiFetch<Plan[]>('/plans');
}

export function createPlan(payload: PlanPayload) {
  return apiFetch<Plan>('/plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePlan(id: string, payload: Partial<PlanPayload>) {
  return apiFetch<Plan>(`/plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deletePlan(id: string) {
  return apiFetch<Plan>(`/plans/${id}`, { method: 'DELETE' });
}

export function listClients(filters: ClientListFilters = {}) {
  const params = new URLSearchParams();

  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.planId) params.set('planId', filters.planId);

  const query = params.toString();
  return apiFetch<PaginatedClients>(`/clients${query ? `?${query}` : ''}`);
}

export function getClient(id: string) {
  return apiFetch<Client>(`/clients/${id}`);
}

export function createClient(payload: ClientPayload) {
  return apiFetch<Client>('/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateClient(id: string, payload: ClientPayload) {
  return apiFetch<Client>(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateClientStatus(id: string, status: ClientStatus, reason?: string) {
  return apiFetch<Client>(`/clients/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  });
}
