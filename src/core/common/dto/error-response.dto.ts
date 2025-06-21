/**
 * Standard error response DTO for consistent error handling across the application
 */
export class ErrorResponseDto {
  /**
   * HTTP status code
   * @example 400
   */
  statusCode: number;

  /**
   * Error message describing what went wrong
   * @example "Validation failed"
   */
  message: string;

  /**
   * Timestamp when the error occurred
   * @example "2024-01-15T10:30:00.000Z"
   */
  timestamp: string;

  /**
   * Request path where the error occurred
   * @example "/evaluation/projects"
   */
  path: string;

  /**
   * Optional additional error details
   * @example "Field 'projectId' is required"
   */
  details?: string;

  constructor(
    statusCode: number,
    message: string,
    path: string,
    details?: string,
  ) {
    this.statusCode = statusCode;
    this.message = message;
    this.timestamp = new Date().toISOString();
    this.path = path;
    this.details = details;
  }
}
