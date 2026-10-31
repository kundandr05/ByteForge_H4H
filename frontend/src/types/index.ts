export interface HealthCheckResponse {
  success: boolean;
  message?: string;
  data: {
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
  };
  timestamp: string;
}

export interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: string;
}

export interface SystemStatCard {
  label: string;
  value: string | number;
  subValue?: string;
  change?: string;
  isPositive?: boolean;
  status?: 'operational' | 'warning' | 'alert';
}
