import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout as rxTimeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutValue?: number) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    let timeoutMs = this.timeoutValue;

    // Dynamic timeout calculation for multi-cause evaluations
    if (!timeoutMs) {
      const request = context.switchToHttp().getRequest();
      timeoutMs = this.calculateDynamicTimeout(request.body);
    }

    return next.handle().pipe(
      rxTimeout(timeoutMs),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return throwError(
            () => new RequestTimeoutException('Request timeout'),
          );
        }
        return throwError(() => err);
      }),
    );
  }

  private calculateDynamicTimeout(body: unknown): number {
    const requestBody = body as {
      causes?: Array<{ projectIds?: number[] }>;
      projectIds?: number[];
    };

    // Default timeout for single cause
    if (!requestBody.causes) {
      const projectCount = requestBody.projectIds?.length ?? 1;
      return Math.max(120000, projectCount * 5000); // 5 seconds per project, min 2 minutes
    }

    // Dynamic timeout for multiple causes
    const totalProjects = requestBody.causes.reduce(
      (sum: number, cause) => sum + (cause.projectIds?.length ?? 0),
      0,
    );

    // Formula: Base time + (projects × time per project)
    // Base: 2 minutes, Per project: 4 seconds (LLM + processing time)
    const baseTimeout = 120000; // 2 minutes
    const timePerProject = 4000; // 4 seconds per project
    const calculatedTimeout = baseTimeout + totalProjects * timePerProject;

    // Ensure minimum of 2 minutes and cap at 30 minutes
    const minTimeout = 120000; // 2 minutes minimum
    const maxTimeout = 30 * 60 * 1000; // 30 minutes maximum
    return Math.min(Math.max(calculatedTimeout, minTimeout), maxTimeout);
  }
}
