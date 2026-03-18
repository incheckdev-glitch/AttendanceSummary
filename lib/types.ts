export type SummaryResponse = {
  total: number;
  open: number;
  resolvedClosed: number;
  escalated: number;
  highCritical: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
};

export type TrendPoint = {
  period: string;
  created: number;
  resolved: number;
};

export type AgingBucket = {
  label: string;
  count: number;
};

export type RankingItem = {
  label: string;
  count: number;
};

export type AnalyticsResponse = {
  trend: TrendPoint[];
  aging: AgingBucket[];
  topCompanies: RankingItem[];
  topModules: RankingItem[];
  averageResolutionDays: number | null;
  medianResolutionDays: number | null;
  openIssues: number;
  resolvedIssues: number;
};

export type Issue = {
  id: number;
  timestamp: string;
  requestDate: string;
  submittedBy: string;
  companyName: string;
  issueTitle: string;
  issueCategory: string;
  detailedDescription: string;
  issuePattern: string;
  priorityLevel: string;
  impactType: string;
  workaroundAvailable: string;
  workaroundDetails: string;
  environment: string;
  productModuleAffected: string;
  browserDeviceOs: string;
  errorMessage: string;
  attachmentUpload: string;
  reportedChannel: string;
  sourceOfIssue: string;
  initialAssessment: string;
  rootCauseType: string;
  internalNotes: string;
  escalationRequired: string;
  developmentTicket: string;
  finalStatus: string;
  resolutionClosureDate: string;
  wasCsInformed: string;
};

export type IssuesResponse = {
  items: Issue[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

export type IssuesQuery = {
  q?: string;
  status?: string;
  priority?: string;
  category?: string;
  company?: string;
  module?: string;
  escalated?: string;
  page?: number;
  pageSize?: number;
};
