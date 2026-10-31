export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta | Record<string, unknown>;
  code?: string;
  timestamp?: string;
}

export interface HealthCheckData {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  database: {
    connected: boolean;
    provider: string;
    latencyMs?: number;
  };
  system: {
    nodeVersion: string;
    memoryUsageMB: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
    };
  };
}

export interface DatabaseHealthData {
  status: 'connected' | 'error';
  provider: string;
  latencyMs: number;
  databaseUrl: string;
  tableCounts: {
    technicians: number;
    jobs: number;
    assignments: number;
    schedulingRuns: number;
    schedulingRunDetails: number;
    disruptionEvents: number;
    unavailabilities: number;
    auditLogs: number;
    idempotencyRecords: number;
  };
  timestamp: string;
}

// -------------------------------------------------------------
// Job Query and Filter Types
// -------------------------------------------------------------

export interface JobListQuery {
  page?: number;
  limit?: number;
  search?: string;
  priority?: string;
  status?: string;
  serviceZone?: string;
  sortBy?: 'createdAt' | 'priority' | 'slaDeadline' | 'earliestStart';
  sortOrder?: 'asc' | 'desc';
}

// -------------------------------------------------------------
// Technician Query and Filter Types
// -------------------------------------------------------------

export interface TechnicianListQuery {
  page?: number;
  limit?: number;
  search?: string;
  skill?: string;
  serviceZone?: string;
  availability?: string;
  sortBy?: 'createdAt' | 'name' | 'availabilityStatus';
  sortOrder?: 'asc' | 'desc';
}
