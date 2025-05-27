import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

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
      this.logger.error(
        `Unhandled exception: ${exceptionString}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    };

    // Log the error response
    this.logger.error(
      `HTTP ${status} Error: ${message} - ${request.method} ${request.url}`,
    );

    response.status(status).json(errorResponse);
  }
}
