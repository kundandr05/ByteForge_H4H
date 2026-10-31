import { Application } from 'express';
import swaggerUi from 'swagger-ui-express';

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'DispatchGrid API - Intelligent Workforce Scheduling & Recovery Engine',
    version: '0.3.0',
    description:
      'Production-ready REST API for field service management, workforce shift constraints, SLA-driven job scheduling, and automated disruption recovery.',
    contact: {
      name: 'DispatchGrid Engineering',
      url: 'https://dispatchgrid.io',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'Default Local API Gateway',
    },
  ],
  tags: [
    { name: 'Jobs', description: 'Work orders, SLA boundaries, and status state machine' },
    { name: 'Technicians', description: 'Technician profiles, skill sets, and shift availability' },
    { name: 'Scheduling', description: 'Intelligent workforce scheduling, optimization, and timeline explanations' },
    { name: 'Optimization', description: 'Schedule refinement, route reordering, workload balancing, and multi-criteria optimization' },
    { name: 'Disruptions', description: 'Real-time operational disruption management and recovery replanning' },
    { name: 'Recovery', description: 'Recovery history, metrics comparisons, and automated repair' },
    { name: 'Audit', description: 'Centralized immutable audit trail and historical compliance' },
    { name: 'Explainability', description: 'Decision rationales, hard constraint checklists, and candidate evaluations' },
    { name: 'Health', description: 'System and database runtime health checks' },
  ],
  paths: {
    '/jobs': {
      get: {
        tags: ['Jobs'],
        summary: 'List jobs with search, filtering, and pagination',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search customer name & description' },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'UNASSIGNED'] } },
          { name: 'serviceZone', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'priority', 'slaDeadline', 'earliestStart'], default: 'createdAt' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: { description: 'Paginated list of jobs', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobListResponse' } } } },
        },
      },
      post: {
        tags: ['Jobs'],
        summary: 'Create a new job order',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/JobCreateInput' } } },
        },
        responses: {
          201: { description: 'Job created successfully' },
          400: { description: 'Validation failed or invalid coordinates/time range' },
        },
      },
    },
    '/jobs/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Get job by UUID with assignment history',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Job details with assignments' },
          404: { description: 'Job not found' },
        },
      },
      put: {
        tags: ['Jobs'],
        summary: 'Update job details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/JobUpdateInput' } } },
        },
        responses: {
          200: { description: 'Job updated successfully' },
          400: { description: 'Invalid attributes or attempt to edit terminal/in-progress job' },
          404: { description: 'Job not found' },
        },
      },
      delete: {
        tags: ['Jobs'],
        summary: 'Safely delete job',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Job deleted' },
          400: { description: 'Unsafe deletion rejected (e.g. active assignments or in-progress)' },
          404: { description: 'Job not found' },
        },
      },
    },
    '/jobs/{id}/status': {
      patch: {
        tags: ['Jobs'],
        summary: 'Transition job status through controlled state machine',
        description: 'Allowed: PENDING->[ASSIGNED,UNASSIGNED,CANCELLED], ASSIGNED->[IN_PROGRESS,PENDING,CANCELLED], IN_PROGRESS->[COMPLETED], UNASSIGNED->[ASSIGNED,CANCELLED]. Terminal: COMPLETED, CANCELLED.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/JobStatusUpdateInput' } } },
        },
        responses: {
          200: { description: 'Status transitioned successfully' },
          400: { description: 'Disallowed state transition (INVALID_STATUS_TRANSITION)' },
          404: { description: 'Job not found' },
        },
      },
    },
    '/technicians': {
      get: {
        tags: ['Technicians'],
        summary: 'List technicians with search, skill filtering, and pagination',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search technician name' },
          { name: 'skill', in: 'query', schema: { type: 'string' }, description: 'Filter by skill tag (e.g. HVAC)' },
          { name: 'serviceZone', in: 'query', schema: { type: 'string' } },
          { name: 'availability', in: 'query', schema: { type: 'string', enum: ['AVAILABLE', 'ON_SHIFT', 'UNAVAILABLE', 'OFF_DUTY'] } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'name', 'availabilityStatus'], default: 'createdAt' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: { description: 'Paginated list of technicians' },
        },
      },
      post: {
        tags: ['Technicians'],
        summary: 'Create a new technician',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TechnicianCreateInput' } } },
        },
        responses: {
          201: { description: 'Technician created successfully' },
          400: { description: 'Validation error (coordinates, shift format)' },
          409: { description: 'Duplicate email error (DUPLICATE_EMAIL)' },
        },
      },
    },
    '/technicians/{id}': {
      get: {
        tags: ['Technicians'],
        summary: 'Get technician by UUID with assignments and unavailabilities',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Technician details' },
          404: { description: 'Technician not found' },
        },
      },
      put: {
        tags: ['Technicians'],
        summary: 'Update technician details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TechnicianUpdateInput' } } },
        },
        responses: {
          200: { description: 'Technician updated successfully' },
          400: { description: 'Validation error' },
          404: { description: 'Technician not found' },
          409: { description: 'Duplicate email conflict' },
        },
      },
      delete: {
        tags: ['Technicians'],
        summary: 'Safely delete technician',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Technician deleted' },
          400: { description: 'Unsafe deletion rejected (active scheduled assignments exist)' },
          404: { description: 'Technician not found' },
        },
      },
    },
    '/technicians/{id}/availability': {
      patch: {
        tags: ['Technicians'],
        summary: 'Update technician availability status',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TechnicianAvailabilityInput' } } },
        },
        responses: {
          200: { description: 'Availability updated successfully' },
          400: { description: 'Invalid availability status' },
          404: { description: 'Technician not found' },
        },
      },
    },
    '/scheduling/generate': {
      post: {
        tags: ['Scheduling'],
        summary: 'Generate and commit optimized workforce schedule',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  runType: { type: 'string', enum: ['INITIAL', 'OPTIMIZATION', 'RECOVERY'], default: 'INITIAL' },
                  idempotencyKey: { type: 'string', example: 'dispatch-run-20261102-01' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Schedule generated successfully' },
        },
      },
    },
    '/scheduling/current': {
      get: {
        tags: ['Scheduling'],
        summary: 'Get current active schedule and assignments',
        responses: {
          200: { description: 'Current schedule' },
        },
      },
    },
    '/scheduling/runs': {
      get: {
        tags: ['Scheduling'],
        summary: 'Get historical scheduling runs',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Paginated runs list' },
        },
      },
    },
    '/scheduling/runs/{id}': {
      get: {
        tags: ['Scheduling'],
        summary: 'Get scheduling run by ID with audit details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Run details' },
          404: { description: 'Run not found' },
        },
      },
    },
    '/scheduling/jobs/{jobId}/explanation': {
      get: {
        tags: ['Scheduling'],
        summary: 'Get job assignment or unassigned explanation and candidate rejection audit',
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Job explanation' },
          404: { description: 'Job not found' },
        },
      },
    },
    '/scheduling/technicians/{technicianId}/schedule': {
      get: {
        tags: ['Scheduling'],
        summary: 'Get chronological schedule timeline for a technician',
        parameters: [{ name: 'technicianId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Technician timeline' },
          404: { description: 'Technician not found' },
        },
      },
    },
    '/optimization/run': {
      post: {
        tags: ['Optimization'],
        summary: 'Execute iterative local search optimization and commit improved schedule',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  maxIterations: { type: 'integer', default: 50 },
                  maxDurationMs: { type: 'integer', default: 5000 },
                  minImprovementThreshold: { type: 'number', default: 0.05 },
                  idempotencyKey: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Schedule optimization executed and committed successfully' },
        },
      },
    },
    '/optimization/preview': {
      post: {
        tags: ['Optimization'],
        summary: 'Preview schedule optimization in-memory without database mutations',
        responses: {
          200: { description: 'Optimization preview evaluated successfully' },
        },
      },
    },
    '/optimization/runs': {
      get: {
        tags: ['Optimization'],
        summary: 'List historical optimization runs with pagination',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Paginated list of optimization runs' },
        },
      },
    },
    '/optimization/runs/{id}': {
      get: {
        tags: ['Optimization'],
        summary: 'Get optimization run details and assignment modifications by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Optimization run details' },
          404: { description: 'Run not found' },
        },
      },
    },
    '/optimization/runs/{id}/comparison': {
      get: {
        tags: ['Optimization'],
        summary: 'Get before-and-after metrics comparison for an optimization run',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Before-and-after comparison report' },
        },
      },
    },
    '/optimization/runs/{id}/changes': {
      get: {
        tags: ['Optimization'],
        summary: 'Get detailed list of assignment changes for an optimization run',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'List of changed assignments with impact explanations' },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Application runtime health check',
        responses: {
          200: { description: 'Service operational' },
        },
      },
    },
    '/health/database': {
      get: {
        tags: ['Health'],
        summary: 'Database connection & entity telemetry probe',
        responses: {
          200: { description: 'Database operational' },
          503: { description: 'Database unreachable' },
        },
      },
    },
    '/audit': {
      get: {
        tags: ['Audit'],
        summary: 'Query immutable audit logs with pagination, filtering, and sorting',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'entityType', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'createdAt' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: { description: 'Paginated audit trail list' },
        },
      },
    },
    '/audit/{id}': {
      get: {
        tags: ['Audit'],
        summary: 'Get individual audit log by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Audit log record' },
          404: { description: 'Audit log not found' },
        },
      },
    },
    '/audit/entity/{entityType}/{entityId}': {
      get: {
        tags: ['Audit'],
        summary: 'Get full audit trail for a specific entity',
        parameters: [
          { name: 'entityType', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'entityId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Historical audit trail for entity' },
        },
      },
    },
    '/explanations/jobs/{jobId}': {
      get: {
        tags: ['Explainability'],
        summary: 'Explain scheduling status, scores, constraints, and rejection reasons for a job',
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Detailed job scheduling explanation' },
          404: { description: 'Job not found' },
        },
      },
    },
    '/explanations/assignments/{assignmentId}': {
      get: {
        tags: ['Explainability'],
        summary: 'Explain assignment decision, constraint checklist, and surrounding schedule',
        parameters: [{ name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Detailed assignment explanation' },
          404: { description: 'Assignment not found' },
        },
      },
    },
    '/explanations/scheduling-runs/{runId}': {
      get: {
        tags: ['Explainability'],
        summary: 'Explain decisions and constraint metrics across an entire scheduling run',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Scheduling run explanation and metrics' },
          404: { description: 'Run not found' },
        },
      },
    },
    '/explanations/optimization-runs/{runId}': {
      get: {
        tags: ['Explainability'],
        summary: 'Explain optimization operations, accepted moves, and rejected candidates',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Optimization run explanation' },
          404: { description: 'Run not found' },
        },
      },
    },
    '/explanations/recovery-runs/{runId}': {
      get: {
        tags: ['Explainability'],
        summary: 'Explain disruption recovery actions, alternative technicians, and SLA impacts',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Recovery run explanation' },
          404: { description: 'Run not found' },
        },
      },
    },
    '/disruptions': {
      post: {
        tags: ['Disruptions'],
        summary: 'Register a real-time operational disruption event',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          201: { description: 'Disruption registered' },
        },
      },
      get: {
        tags: ['Disruptions'],
        summary: 'List historical disruptions with filtering',
        responses: {
          200: { description: 'List of disruption events' },
        },
      },
    },
    '/disruptions/{id}/recover': {
      post: {
        tags: ['Disruptions'],
        summary: 'Trigger intelligent automated recovery for a disruption',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Recovery replanning result' },
        },
      },
    },
    '/recovery/history': {
      get: {
        tags: ['Recovery'],
        summary: 'List historical recovery runs',
        responses: {
          200: { description: 'Paginated recovery runs' },
        },
      },
    },
    '/recovery/{id}/comparison': {
      get: {
        tags: ['Recovery'],
        summary: 'Compare before and after metrics for a recovery operation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Metrics comparison' },
        },
      },
    },
  },
  components: {
    schemas: {
      JobCreateInput: {
        type: 'object',
        required: [
          'customerName',
          'description',
          'requiredSkills',
          'estimatedDuration',
          'latitude',
          'longitude',
          'serviceZone',
          'earliestStart',
          'latestEnd',
          'slaDeadline',
        ],
        properties: {
          customerName: { type: 'string', example: 'Apex Data Center' },
          description: { type: 'string', example: 'Chiller compressor cooling failure emergency' },
          requiredSkills: { type: 'array', items: { type: 'string' }, example: ['HVAC', 'REFRIGERATION'] },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
          estimatedDuration: { type: 'integer', example: 120, description: 'Minutes' },
          latitude: { type: 'number', example: 37.7749 },
          longitude: { type: 'number', example: -122.4194 },
          serviceZone: { type: 'string', example: 'ZONE_NORTH' },
          earliestStart: { type: 'string', format: 'date-time', example: '2026-10-31T08:00:00.000Z' },
          latestEnd: { type: 'string', format: 'date-time', example: '2026-10-31T17:00:00.000Z' },
          slaDeadline: { type: 'string', format: 'date-time', example: '2026-10-31T16:00:00.000Z' },
          status: { type: 'string', enum: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'UNASSIGNED'], default: 'PENDING' },
        },
      },
      JobUpdateInput: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          description: { type: 'string' },
          requiredSkills: { type: 'array', items: { type: 'string' } },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          estimatedDuration: { type: 'integer' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          serviceZone: { type: 'string' },
          earliestStart: { type: 'string', format: 'date-time' },
          latestEnd: { type: 'string', format: 'date-time' },
          slaDeadline: { type: 'string', format: 'date-time' },
        },
      },
      JobStatusUpdateInput: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'UNASSIGNED'] },
        },
      },
      TechnicianCreateInput: {
        type: 'object',
        required: ['name', 'email', 'phone', 'skills', 'serviceZones', 'latitude', 'longitude', 'shiftStart', 'shiftEnd'],
        properties: {
          name: { type: 'string', example: 'Marcus Vance' },
          email: { type: 'string', format: 'email', example: 'marcus.vance@dispatchgrid.io' },
          phone: { type: 'string', example: '+1-555-0102' },
          skills: { type: 'array', items: { type: 'string' }, example: ['ELECTRICAL', 'HIGH_VOLTAGE'] },
          serviceZones: { type: 'array', items: { type: 'string' }, example: ['ZONE_EAST', 'ZONE_SOUTH'] },
          latitude: { type: 'number', example: 37.7558 },
          longitude: { type: 'number', example: -122.4208 },
          shiftStart: { type: 'string', example: '08:00', description: '24-hour UTC HH:mm' },
          shiftEnd: { type: 'string', example: '17:00', description: '24-hour UTC HH:mm' },
          availabilityStatus: { type: 'string', enum: ['AVAILABLE', 'ON_SHIFT', 'UNAVAILABLE', 'OFF_DUTY'], default: 'AVAILABLE' },
        },
      },
      TechnicianUpdateInput: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
          serviceZones: { type: 'array', items: { type: 'string' } },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          shiftStart: { type: 'string' },
          shiftEnd: { type: 'string' },
          availabilityStatus: { type: 'string', enum: ['AVAILABLE', 'ON_SHIFT', 'UNAVAILABLE', 'OFF_DUTY'] },
        },
      },
      TechnicianAvailabilityInput: {
        type: 'object',
        required: ['availabilityStatus'],
        properties: {
          availabilityStatus: { type: 'string', enum: ['AVAILABLE', 'ON_SHIFT', 'UNAVAILABLE', 'OFF_DUTY'] },
        },
      },
      JobListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Jobs retrieved successfully' },
          data: { type: 'array', items: { type: 'object' } },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
              hasNext: { type: 'boolean' },
              hasPrev: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
};

export function setupSwagger(app: Application): void {
  // Serve raw OpenAPI JSON specification
  app.get('/api/docs/swagger.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerSpec);
  });

  // Serve Swagger UI interface
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'DispatchGrid API Documentation',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );
}

export default setupSwagger;
