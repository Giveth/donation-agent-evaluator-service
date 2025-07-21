import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithCorrelationId extends Request {
  correlationId: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithCorrelationId, res: Response, next: NextFunction) {
    // Check if correlation ID already exists in headers
    const correlationId =
      (req.headers['x-correlation-id'] as string) || uuidv4();

    // Attach correlation ID to request
    req.correlationId = correlationId;

    // Set correlation ID in response headers for client tracking
    res.setHeader('x-correlation-id', correlationId);

    // Set correlation ID in request headers for downstream processing
    req.headers['x-correlation-id'] = correlationId;

    next();
  }
}
