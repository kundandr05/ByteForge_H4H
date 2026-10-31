import { useState, useEffect, useCallback } from 'react';
import { healthService } from '../services/healthService';
import { HealthCheckResponse } from '../types';

export function useHealth(pollIntervalMs = 30000) {
  const [data, setData] = useState<HealthCheckResponse['data'] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const res = await healthService.checkHealth();
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backend unreachable');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();

    if (pollIntervalMs > 0) {
      const interval = setInterval(fetchHealth, pollIntervalMs);
      return () => clearInterval(interval);
    }
  }, [fetchHealth, pollIntervalMs]);

  return { data, loading, error, refetch: fetchHealth };
}
