import { apiClient } from './api';
import {
  Job,
  Technician,
  Assignment,
  SchedulingRun,
  DisruptionEvent,
  AuditLog,
  JobExplanation,
  OptimizationResult,
  RecoveryResult,
  JobPriority,
  JobStatus,
  TechnicianAvailabilityStatus,
  DisruptionEventType,
} from '../types/dispatch';

export interface PaginatedResponse<T> {
  success?: boolean;
  status?: string;
  data: T[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SingleResponse<T> {
  success?: boolean;
  status?: string;
  data: T;
  message?: string;
}

// -------------------------------------------------------------
// Jobs API
// -------------------------------------------------------------
export const jobsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    priority?: JobPriority;
    status?: JobStatus;
    serviceZone?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Job>> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.status) query.set('status', params.status);
    if (params?.serviceZone) query.set('serviceZone', params.serviceZone);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);

    const queryString = query.toString();
    return apiClient<PaginatedResponse<Job>>(`/jobs${queryString ? `?${queryString}` : ''}`);
  },

  get: async (id: string): Promise<SingleResponse<Job>> => {
    return apiClient<SingleResponse<Job>>(`/jobs/${id}`);
  },

  create: async (data: {
    customerName: string;
    description: string;
    requiredSkills: string[];
    priority: JobPriority;
    estimatedDuration: number;
    latitude: number;
    longitude: number;
    serviceZone: string;
    earliestStart: string;
    latestEnd: string;
    slaDeadline: string;
    status?: JobStatus;
  }): Promise<SingleResponse<Job>> => {
    return apiClient<SingleResponse<Job>>('/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: Partial<{
      customerName: string;
      description: string;
      requiredSkills: string[];
      priority: JobPriority;
      estimatedDuration: number;
      latitude: number;
      longitude: number;
      serviceZone: string;
      earliestStart: string;
      latestEnd: string;
      slaDeadline: string;
      status: JobStatus;
    }>
  ): Promise<SingleResponse<Job>> => {
    return apiClient<SingleResponse<Job>>(`/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  updateStatus: async (id: string, status: JobStatus): Promise<SingleResponse<Job>> => {
    return apiClient<SingleResponse<Job>>(`/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  delete: async (id: string): Promise<SingleResponse<{ id: string }>> => {
    return apiClient<SingleResponse<{ id: string }>>(`/jobs/${id}`, {
      method: 'DELETE',
    });
  },
};

// -------------------------------------------------------------
// Technicians API
// -------------------------------------------------------------
export const techniciansApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    serviceZone?: string;
    availabilityStatus?: TechnicianAvailabilityStatus;
    skill?: string;
  }): Promise<PaginatedResponse<Technician>> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.serviceZone) query.set('serviceZone', params.serviceZone);
    if (params?.availabilityStatus) {
      query.set('availability', params.availabilityStatus);
      query.set('availabilityStatus', params.availabilityStatus);
    }
    if (params?.skill) query.set('skill', params.skill);

    const queryString = query.toString();
    return apiClient<PaginatedResponse<Technician>>(`/technicians${queryString ? `?${queryString}` : ''}`);
  },

  get: async (id: string): Promise<SingleResponse<Technician>> => {
    return apiClient<SingleResponse<Technician>>(`/technicians/${id}`);
  },

  create: async (data: {
    name: string;
    email: string;
    phone: string;
    skills: string[];
    serviceZones: string[];
    latitude: number;
    longitude: number;
    shiftStart: string;
    shiftEnd: string;
    availabilityStatus?: TechnicianAvailabilityStatus;
  }): Promise<SingleResponse<Technician>> => {
    return apiClient<SingleResponse<Technician>>('/technicians', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string;
      skills: string[];
      serviceZones: string[];
      latitude: number;
      longitude: number;
      shiftStart: string;
      shiftEnd: string;
      availabilityStatus: TechnicianAvailabilityStatus;
    }>
  ): Promise<SingleResponse<Technician>> => {
    return apiClient<SingleResponse<Technician>>(`/technicians/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  updateAvailability: async (
    id: string,
    availabilityStatus: TechnicianAvailabilityStatus
  ): Promise<SingleResponse<Technician>> => {
    return apiClient<SingleResponse<Technician>>(`/technicians/${id}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ availabilityStatus }),
    });
  },

  delete: async (id: string, force = false): Promise<SingleResponse<{ id: string; name?: string }>> => {
    return apiClient<SingleResponse<{ id: string; name?: string }>>(`/technicians/${id}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    });
  },
};

// -------------------------------------------------------------
// Customers & Clients API (for tracking users who hire technicians)
// -------------------------------------------------------------
export interface CustomerSummary {
  name: string;
  totalAppointments: number;
  activeAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  serviceZones: string[];
  preferredSkills: string[];
  lastBookingDate: string | null;
  lastStatus: string | null;
  recentJobs: Array<{
    id: string;
    description: string;
    status: string;
    priority: string;
    serviceZone: string;
    slaDeadline: string;
    createdAt: string;
    assignedTechnician?: {
      id: string;
      name: string;
      phone: string;
    } | null;
  }>;
}

export const customersApi = {
  list: async (): Promise<SingleResponse<CustomerSummary[]>> => {
    return apiClient<SingleResponse<CustomerSummary[]>>('/customers');
  },
  get: async (name: string): Promise<SingleResponse<CustomerSummary>> => {
    return apiClient<SingleResponse<CustomerSummary>>(`/customers/${encodeURIComponent(name)}`);
  },
};

// -------------------------------------------------------------
// AI Voice & Text Booking API (Groq Cloud & Local NLP)
// -------------------------------------------------------------
export interface ParsedBookingResult {
  description: string;
  requiredSkills: string[];
  serviceZone: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedDuration: number;
  timePreference?: string;
  explanation: string;
  source: 'groq-llama-3.3' | 'intelligent-local-nlp';
}

export const aiBookingApi = {
  parse: async (prompt: string, groqApiKey?: string): Promise<SingleResponse<ParsedBookingResult>> => {
    return apiClient<SingleResponse<ParsedBookingResult>>('/ai/parse-booking', {
      method: 'POST',
      body: JSON.stringify({ prompt, groqApiKey }),
    });
  },
  book: async (bookingData: {
    customerName: string;
    description: string;
    requiredSkills: string[];
    serviceZone: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedDuration?: number;
    preferredDate?: string;
  }): Promise<SingleResponse<Job>> => {
    return apiClient<SingleResponse<Job>>('/ai/book', {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  },
};

// -------------------------------------------------------------
// Scheduling Engine API
// -------------------------------------------------------------
export const schedulingApi = {
  generate: async (options?: {
    runType?: 'INITIAL';
    weights?: Record<string, number>;
    idempotencyKey?: string;
    referenceDate?: string;
  }): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>('/scheduling/generate', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  getCurrent: async (): Promise<SingleResponse<{
    assignments: Assignment[];
    totalActiveAssignments: number;
    assignedTechniciansCount: number;
    totalTravelMinutes: number;
  }>> => {
    return apiClient<SingleResponse<any>>('/scheduling/current');
  },

  getRuns: async (page = 1, limit = 10): Promise<PaginatedResponse<SchedulingRun>> => {
    return apiClient<PaginatedResponse<SchedulingRun>>(`/scheduling/runs?page=${page}&limit=${limit}`);
  },

  getRunDetails: async (id: string): Promise<SingleResponse<SchedulingRun>> => {
    return apiClient<SingleResponse<SchedulingRun>>(`/scheduling/runs/${id}`);
  },

  getTechnicianSchedule: async (
    technicianId: string,
    date?: string
  ): Promise<SingleResponse<{
    technician: Technician;
    date: string;
    timeline: Array<{
      type: 'ASSIGNMENT' | 'UNAVAILABILITY';
      startTime: string;
      endTime: string;
      durationMinutes: number;
      job?: Job;
      reason?: string;
      travelTimeMinutes?: number;
    }>;
    totalWorkingMinutes: number;
  }>> => {
    const q = date ? `?date=${date}` : '';
    return apiClient<SingleResponse<any>>(`/scheduling/technicians/${technicianId}/schedule${q}`);
  },
};

// -------------------------------------------------------------
// Assignment Optimization API
// -------------------------------------------------------------
export const optimizationApi = {
  preview: async (options?: {
    maxIterations?: number;
    weights?: Record<string, number>;
  }): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>('/optimization/preview', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  run: async (options?: {
    maxIterations?: number;
    weights?: Record<string, number>;
    idempotencyKey?: string;
  }): Promise<SingleResponse<OptimizationResult>> => {
    return apiClient<SingleResponse<OptimizationResult>>('/optimization/run', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  getRuns: async (page = 1, limit = 10): Promise<PaginatedResponse<SchedulingRun>> => {
    return apiClient<PaginatedResponse<SchedulingRun>>(`/optimization/runs?page=${page}&limit=${limit}`);
  },

  getComparison: async (runId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/optimization/runs/${runId}/comparison`);
  },

  getChanges: async (runId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/optimization/runs/${runId}/changes`);
  },
};

// -------------------------------------------------------------
// Disruption & Recovery API
// -------------------------------------------------------------
export const disruptionsApi = {
  create: async (data: {
    eventType: DisruptionEventType;
    technicianId?: string;
    jobId?: string;
    description: string;
    eventPayload?: any;
  }): Promise<SingleResponse<DisruptionEvent>> => {
    return apiClient<SingleResponse<DisruptionEvent>>('/disruptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  list: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
  }): Promise<PaginatedResponse<DisruptionEvent>> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);

    const queryString = query.toString();
    return apiClient<PaginatedResponse<DisruptionEvent>>(`/disruptions${queryString ? `?${queryString}` : ''}`);
  },

  get: async (id: string): Promise<SingleResponse<DisruptionEvent>> => {
    return apiClient<SingleResponse<DisruptionEvent>>(`/disruptions/${id}`);
  },

  recover: async (
    id: string,
    options?: { referenceDate?: string; idempotencyKey?: string }
  ): Promise<SingleResponse<RecoveryResult>> => {
    return apiClient<SingleResponse<RecoveryResult>>(`/disruptions/${id}/recover`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  getReport: async (id: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/disruptions/${id}/recovery-report`);
  },

  getHistory: async (page = 1, limit = 10): Promise<PaginatedResponse<SchedulingRun>> => {
    return apiClient<PaginatedResponse<SchedulingRun>>(`/recovery/history?page=${page}&limit=${limit}`);
  },

  getComparison: async (runId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/recovery/${runId}/comparison`);
  },
};

// -------------------------------------------------------------
// Audit Logs API
// -------------------------------------------------------------
export const auditApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    entityType?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<AuditLog>> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.entityType) query.set('entityType', params.entityType);
    if (params?.action) query.set('action', params.action);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);

    const queryString = query.toString();
    return apiClient<PaginatedResponse<AuditLog>>(`/audit${queryString ? `?${queryString}` : ''}`);
  },

  get: async (id: string): Promise<SingleResponse<AuditLog>> => {
    return apiClient<SingleResponse<AuditLog>>(`/audit/${id}`);
  },

  getByEntity: async (
    entityType: string,
    entityId: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<AuditLog>> => {
    return apiClient<PaginatedResponse<AuditLog>>(
      `/audit/entity/${entityType}/${entityId}?page=${page}&limit=${limit}`
    );
  },
};

// -------------------------------------------------------------
// Explainability API
// -------------------------------------------------------------
export const explainabilityApi = {
  explainJob: async (jobId: string): Promise<SingleResponse<JobExplanation>> => {
    return apiClient<SingleResponse<JobExplanation>>(`/explanations/jobs/${jobId}`);
  },

  explainAssignment: async (assignmentId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/explanations/assignments/${assignmentId}`);
  },

  explainSchedulingRun: async (runId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/explanations/scheduling-runs/${runId}`);
  },

  explainOptimizationRun: async (runId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/explanations/optimization-runs/${runId}`);
  },

  explainRecoveryRun: async (runId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/explanations/recovery-runs/${runId}`);
  },
};

// -------------------------------------------------------------
// Health & System Telemetry API
// -------------------------------------------------------------
export const healthApi = {
  getHealth: async (): Promise<any> => {
    return apiClient<any>('/health');
  },

  getDatabaseHealth: async (): Promise<any> => {
    return apiClient<any>('/health/database');
  },
};

// -------------------------------------------------------------
// Automated Dispatch & Technician Experience API
// -------------------------------------------------------------
export const autoDispatchApi = {
  startAllocation: async (jobId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/dispatch/auto-allocate/${jobId}`, {
      method: 'POST',
    });
  },

  autoAllocateAll: async (): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>('/dispatch/auto-allocate', {
      method: 'POST',
    });
  },

  getActiveOffer: async (technicianId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/dispatch/technician/${technicianId}/active-offer`);
  },

  acceptOffer: async (jobId: string, technicianId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/dispatch/offers/${jobId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ technicianId }),
    });
  },

  rejectOffer: async (jobId: string, technicianId: string, reason?: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/dispatch/offers/${jobId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ technicianId, reason }),
    });
  },

  getAllCascades: async (): Promise<SingleResponse<any[]>> => {
    return apiClient<SingleResponse<any[]>>('/dispatch/status');
  },

  getCascade: async (jobId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/dispatch/status/${jobId}`);
  },

  getEarnings: async (technicianId: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/dispatch/technicians/${technicianId}/earnings`);
  },

  getDiscoverOffers: async (): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>('/dispatch/technicians/discover');
  },

  updateOnlineStatus: async (technicianId: string, isOnline: boolean): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/dispatch/technicians/${technicianId}/online-status`, {
      method: 'PATCH',
      body: JSON.stringify({ isOnline }),
    });
  },

  autoScheduleAll: async (referenceDate?: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>('/dispatch/auto-schedule-all', {
      method: 'POST',
      body: JSON.stringify({ referenceDate }),
    });
  },

  simulateResponse: async (jobId: string, action: 'ACCEPT' | 'REJECT', reason?: string): Promise<SingleResponse<any>> => {
    return apiClient<SingleResponse<any>>(`/dispatch/simulate/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    });
  },
};
