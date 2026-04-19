export interface AppConfig {
  env: 'development' | 'staging' | 'production' | 'test';
  port: number;
  host: string;
  baseUrl: string;
  database: DbConfig;
  cache: RedisConfig;
  auth: AuthConfig;
  payments: PaymentsConfig;
  email: EmailConfig;
  storage: StorageConfig;
  observability: ObservabilityConfig;
}

export interface DbConfig {
  url: string;
  maxConnections: number;
  idleTimeoutMs: number;
  ssl: boolean;
  debug: boolean;
}

export interface RedisConfig {
  url: string;
  maxRetries: number;
  connectTimeoutMs: number;
  keyPrefix: string;
}

export interface AuthConfig {
  jwtSecret: string;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  bcryptRounds: number;
  maxActiveSessions: number;
}

export interface PaymentsConfig {
  stripe: { apiKey: string; webhookSecret: string; sandbox: boolean };
  paypal: { clientId: string; clientSecret: string; sandbox: boolean };
  mercadopago: { accessToken: string; sandbox: boolean };
}

export interface EmailConfig {
  provider: 'sendgrid' | 'ses' | 'smtp' | 'noop';
  apiKey?: string;
  from: string;
  replyTo?: string;
  smtpConfig?: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } };
}

export interface StorageConfig {
  provider: 's3' | 'gcs' | 'local';
  bucket: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  localPath?: string;
  cdnUrl?: string;
}

export interface ObservabilityConfig {
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  tracing: { enabled: boolean; endpoint?: string; sampleRate: number };
  metrics: { enabled: boolean; port: number };
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    env: (env.NODE_ENV as AppConfig['env']) ?? 'development',
    port: parseInt(env.PORT ?? '3000', 10),
    host: env.HOST ?? '0.0.0.0',
    baseUrl: env.BASE_URL ?? 'http://localhost:3000',
    database: {
      url: env.DATABASE_URL ?? 'postgresql://localhost:5432/app',
      maxConnections: parseInt(env.DB_MAX_CONNECTIONS ?? '10', 10),
      idleTimeoutMs: parseInt(env.DB_IDLE_TIMEOUT_MS ?? '30000', 10),
      ssl: env.DB_SSL === 'true',
      debug: env.DB_DEBUG === 'true',
    },
    cache: {
      url: env.REDIS_URL ?? 'redis://localhost:6379',
      maxRetries: parseInt(env.REDIS_MAX_RETRIES ?? '3', 10),
      connectTimeoutMs: parseInt(env.REDIS_CONNECT_TIMEOUT_MS ?? '5000', 10),
      keyPrefix: env.REDIS_KEY_PREFIX ?? 'app:',
    },
    auth: {
      jwtSecret: env.JWT_SECRET ?? 'change-me-in-production',
      accessTokenTtl: parseInt(env.ACCESS_TOKEN_TTL ?? '3600', 10),
      refreshTokenTtl: parseInt(env.REFRESH_TOKEN_TTL ?? '2592000', 10),
      bcryptRounds: parseInt(env.BCRYPT_ROUNDS ?? '12', 10),
      maxActiveSessions: parseInt(env.MAX_ACTIVE_SESSIONS ?? '5', 10),
    },
    payments: {
      stripe: { apiKey: env.STRIPE_API_KEY ?? '', webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '', sandbox: env.STRIPE_SANDBOX !== 'false' },
      paypal: { clientId: env.PAYPAL_CLIENT_ID ?? '', clientSecret: env.PAYPAL_CLIENT_SECRET ?? '', sandbox: env.PAYPAL_SANDBOX !== 'false' },
      mercadopago: { accessToken: env.MERCADOPAGO_ACCESS_TOKEN ?? '', sandbox: env.MERCADOPAGO_SANDBOX !== 'false' },
    },
    email: {
      provider: (env.EMAIL_PROVIDER as EmailConfig['provider']) ?? 'noop',
      apiKey: env.EMAIL_API_KEY,
      from: env.EMAIL_FROM ?? 'noreply@example.com',
      replyTo: env.EMAIL_REPLY_TO,
    },
    storage: {
      provider: (env.STORAGE_PROVIDER as StorageConfig['provider']) ?? 'local',
      bucket: env.STORAGE_BUCKET ?? 'uploads',
      region: env.STORAGE_REGION,
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
      localPath: env.STORAGE_LOCAL_PATH ?? './uploads',
      cdnUrl: env.CDN_URL,
    },
    observability: {
      logLevel: (env.LOG_LEVEL as ObservabilityConfig['logLevel']) ?? 'info',
      tracing: { enabled: env.TRACING_ENABLED === 'true', endpoint: env.TRACING_ENDPOINT, sampleRate: parseFloat(env.TRACING_SAMPLE_RATE ?? '0.1') },
      metrics: { enabled: env.METRICS_ENABLED === 'true', port: parseInt(env.METRICS_PORT ?? '9090', 10) },
    },
  };
}

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];
  if (config.env === 'production') {
    if (config.auth.jwtSecret === 'change-me-in-production') errors.push('JWT_SECRET must be set in production');
    if (!config.database.ssl) errors.push('Database SSL must be enabled in production');
    if (!config.email.apiKey && config.email.provider !== 'noop') errors.push('Email API key required in production');
  }
  if (config.port < 1 || config.port > 65535) errors.push(`Invalid port: ${config.port}`);
  return errors;
}
