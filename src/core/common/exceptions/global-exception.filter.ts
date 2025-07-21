import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Request, Response } from 'express';
import { RequestWithCorrelationId } from '../../logger/correlation-id.middleware';
import { ErrorResponseDto } from '../dto/error-response.dto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithCorrelationId>();

    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();
      const { message: exceptionMessage } = exception;

      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else {
        const errorObj = errorResponse as { message?: string };
        message = errorObj.message ?? exceptionMessage;
      }
    } else {
      // Handle non-HTTP exceptions
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';

      // Log the full exception for debugging
      const exceptionString =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.error('Unhandled exception occurred', {
        context: 'GlobalExceptionFilter',
        correlationId: request.correlationId,
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        exceptionMessage: exceptionString,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    const errorResponse = new ErrorResponseDto(status, message, request.url);

    // Log the error response
    this.logger.error('HTTP error response', {
      context: 'GlobalExceptionFilter',
      correlationId: request.correlationId,
      statusCode: status,
      message,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    response.status(status).json(errorResponse);
  }
}
