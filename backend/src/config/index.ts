import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10)),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  DEFAULT_TRAVEL_SPEED_KMH: z
    .string()
    .default('45')
    .transform((val) => parseFloat(val)),
  TRAVEL_BUFFER_MINUTES: z
    .string()
    .default('5')
    .transform((val) => parseInt(val, 10)),
  OPTIMIZATION_MAX_ITERATIONS: z
    .string()
    .default('50')
    .transform((val) => parseInt(val, 10)),
  OPTIMIZATION_MAX_DURATION_MS: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10)),
  OPTIMIZATION_MIN_IMPROVEMENT_THRESHOLD: z
    .string()
    .default('0.05')
    .transform((val) => parseFloat(val)),
  OPTIMIZATION_WEIGHT_SLA: z
    .string()
    .default('0.35')
    .transform((val) => parseFloat(val)),
  OPTIMIZATION_WEIGHT_TRAVEL: z
    .string()
    .default('0.25')
    .transform((val) => parseFloat(val)),
  OPTIMIZATION_WEIGHT_UNASSIGNED_PRIORITY: z
    .string()
    .default('0.15')
    .transform((val) => parseFloat(val)),
  OPTIMIZATION_WEIGHT_WORKLOAD_BALANCE: z
    .string()
    .default('0.10')
    .transform((val) => parseFloat(val)),
  OPTIMIZATION_WEIGHT_OVERTIME: z
    .string()
    .default('0.10')
    .transform((val) => parseFloat(val)),
  OPTIMIZATION_WEIGHT_STABILITY: z
    .string()
    .default('0.05')
    .transform((val) => parseFloat(val)),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const config = parsedEnv.data;
export type Config = typeof config;
export default config;
