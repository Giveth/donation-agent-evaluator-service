/**
 * Standard success response DTO for consistent success responses across the application
 * @template T The type of data being returned
 */
export class SuccessResponseDto<T = unknown> {
  /**
   * Response status indicating success
   * @example "success"
   */
  status: 'success';

  /**
   * The actual data payload
   */
  data: T;

  /**
   * Timestamp when the response was generated
   * @example "2024-01-15T10:30:00.000Z"
   */
  timestamp: string;

  /**
   * Optional message providing additional context
   * @example "Evaluation completed successfully"
   */
  message?: string;

  constructor(data: T, message?: string) {
    this.status = 'success';
    this.data = data;
    this.timestamp = new Date().toISOString();
    this.message = message;
  }
}

/**
 * Helper function to create a success response
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
): SuccessResponseDto<T> {
  return new SuccessResponseDto(data, message);
}
