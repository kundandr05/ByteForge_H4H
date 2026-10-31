/**
 * DispatchGrid Assignment Optimization Engine Module (Phase 6)
 */

export * from './optimization.types';
export * from './optimization.objective';
export * from './candidate-generator';
export * from './local-search';
export * from './workload-balancer';
export * from './schedule-comparator';
export * from './optimization-explainer';
export * from './optimization.engine';
export * from './optimization.service';

export const OPTIMIZATION_ENGINE_METADATA = {
  name: 'DispatchGrid Multi-Criteria Assignment Optimization Engine',
  version: '1.0.0',
  status: 'production-ready',
};
