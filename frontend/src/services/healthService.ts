import { apiClient } from './api';
import { HealthCheckResponse } from '../types';

export const healthService = {
  checkHealth: async (): Promise<HealthCheckResponse> => {
    return apiClient<HealthCheckResponse>('/health');
  },
};

export default healthService;
