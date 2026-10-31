/**
 * DispatchGrid Scheduling & Recovery Engine Module
 */

export * from './scheduling.types';
export * from './travel-calculator';
export * from './job-priority';
export * from './technician-eligibility';
export * from './slot-generator';
export * from './constraint-validator';
export * from './assignment-scorer';
export * from './scheduling-explainer';
export * from './scheduling-metrics';
export * from './scheduling.engine';
export * from './scheduling.service';

export const SCHEDULING_ENGINE_METADATA = {
  name: 'DispatchGrid Workforce Optimizer & Recovery Engine',
  version: '1.0.0',
  status: 'production-ready',
};
