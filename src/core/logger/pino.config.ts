import { Params } from 'nestjs-pino';
import * as pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { IncomingMessage, ServerResponse } from 'http';

interface RequestWithHeaders extends IncomingMessage {
  method: string;
  url: string;
  ip: string;
  id: string;
  headers: {
    'user-agent'?: string;
    'x-correlation-id'?: string;
    [key: string]: string | string[] | undefined;
  };
}

interface ResponseWithStatusCode extends ServerResponse {
  statusCode: number;
}

export function createPinoConfig(): Params {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const logLevel = process.env.LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info');
  const logFormat =
    process.env.LOG_FORMAT ?? (isDevelopment ? 'pretty' : 'json');
  const enableFileLogging = process.env.LOG_ENABLE_FILE === 'true';

  const pinoConfig: pino.LoggerOptions = {
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'donation-evaluator-service',
      environment: process.env.NODE_ENV ?? 'development',
    },
  };

  // Only add formatters when not using transport targets
  if (!enableFileLogging) {
    pinoConfig.formatters = {
      level: label => {
        return { level: label };
      },
    };
  }

  // Configure transport based on environment and format preference
  let transport:
    | pino.TransportSingleOptions
    | pino.TransportMultiOptions
    | undefined;

  if (logFormat === 'pretty' && isDevelopment) {
    transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
        messageFormat: '{service}[{context}]: {msg}',
      },
    };
  } else if (enableFileLogging) {
    const logFilePath = process.env.LOG_FILE_PATH ?? './logs/application.log';

    transport = {
      targets: [
        {
          target: 'pino/file',
          level: logLevel,
          options: { destination: 1 }, // stdout
        },
        {
          target: 'pino/file',
          level: logLevel,
          options: {
            destination: logFilePath,
            append: true,
            mkdir: true,
          },
        },
      ],
    };
  }

  if (transport) {
    pinoConfig.transport = transport;
  }

  return {
    pinoHttp: {
      ...pinoConfig,
      customLogLevel: (req, res, err) => {
        if (res.statusCode >= 400 && res.statusCode < 500) {
          return 'warn';
        } else if (res.statusCode >= 500 || err) {
          return 'error';
        } else if (res.statusCode >= 300 && res.statusCode < 400) {
          return 'silent';
        }
        return 'info';
      },
      customSuccessMessage: (req, _res) => {
        if (req.url === '/health') {
          return 'Health check completed';
        }
        return `${req.method} ${req.url} completed`;
      },
      customErrorMessage: (req, _res, err) => {
        return `${req.method} ${req.url} failed - ${err.message}`;
      },
      customAttributeKeys: {
        req: 'request',
        res: 'response',
        err: 'error',
        responseTime: 'duration',
      },
      serializers: {
        req: (req: RequestWithHeaders) => ({
          method: req.method,
          url: req.url,
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          correlationId: (req.headers['x-correlation-id'] as string) || req.id,
        }),
        res: (res: ResponseWithStatusCode) => ({
          statusCode: res.statusCode,
        }),
        err: pino.stdSerializers.err,
      },
      // Generate correlation ID for each request
      genReqId: (req: RequestWithHeaders) => {
        return (req.headers['x-correlation-id'] as string) || uuidv4();
      },
      // Don't log health check requests in production to reduce noise
      autoLogging: {
        ignore: (req: RequestWithHeaders) => {
          if (process.env.NODE_ENV === 'production') {
            return req.url === '/health' || req.url === '/metrics';
          }
          return false;
        },
      },
    },
    exclude: ['/health', '/metrics'], // Exclude from HTTP logging middleware
  };
}
