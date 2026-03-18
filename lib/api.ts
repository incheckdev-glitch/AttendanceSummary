import { AnalyticsResponse, IssuesQuery, IssuesResponse, SummaryResponse } from '@/lib/types';

const BASE_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;

function ensureBaseUrl() {
  if (!BASE_URL) {
    throw new Error('NEXT_PUBLIC_APPS_SCRIPT_URL is not configured.');
  }
  return BASE_URL;
}

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

async function parseEnvelope<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.error || 'Unexpected API response');
  }
  return payload.data;
}

export async function getSummary(): Promise<SummaryResponse> {
  const url = new URL(ensureBaseUrl());
  url.searchParams.set('action', 'summary');

  const response = await fetch(url.toString(), {
    next: { revalidate: 60 }
  });

  return parseEnvelope<SummaryResponse>(response);
}

export async function getIssues(query: IssuesQuery = {}): Promise<IssuesResponse> {
  const url = new URL(ensureBaseUrl());
  url.searchParams.set('action', 'issues');

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    next: { revalidate: 30 }
  });

  return parseEnvelope<IssuesResponse>(response);
}

export async function getAnalytics(): Promise<AnalyticsResponse> {
  const url = new URL(ensureBaseUrl());
  url.searchParams.set('action', 'analytics');

  const response = await fetch(url.toString(), {
    next: { revalidate: 60 }
  });

  return parseEnvelope<AnalyticsResponse>(response);
}
