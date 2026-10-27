import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class PostgresExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PostgresExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // If it's already an HttpException, let it pass through
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = exception.getResponse();
      response.status(status).json(typeof message === 'string' ? { message } : message);
      return;
    }

    // Handle Postgres errors by code
    if (exception && typeof exception === 'object' && 'code' in exception) {
      const pgError = exception as { code: string; detail?: string; constraint?: string; message?: string };
      const { status, message } = this.mapPostgresError(pgError);
      this.logger.warn(`Postgres error ${pgError.code}: ${pgError.message}`, 'PostgresExceptionFilter');
      response.status(status).json({ message, code: pgError.code });
      return;
    }

    // Unknown error - log and return 500
    this.logger.error('Unhandled exception', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
  }

  private mapPostgresError(error: { code: string; detail?: string; constraint?: string; message?: string }): { status: number; message: string } {
    switch (error.code) {
      case '23503': // foreign_key_violation
        return { status: HttpStatus.BAD_REQUEST, message: 'Referenced resource does not exist' };
      case '22P02': // invalid_text_representation (e.g., bad UUID)
        return { status: HttpStatus.BAD_REQUEST, message: 'Invalid ID format' };
      case '23505': // unique_violation
        return { status: HttpStatus.CONFLICT, message: 'Resource already exists' };
      case '23514': // check_violation
        return { status: HttpStatus.BAD_REQUEST, message: this.parseCheckConstraint(error.detail ?? error.message ?? '') };
      case '23P01': // exclusion_violation
        return { status: HttpStatus.CONFLICT, message: 'Conflict with existing data' };
      case 'P0001': // raise_exception (custom triggers like enforce_min_age)
        return { status: HttpStatus.BAD_REQUEST, message: this.parseRaiseException(error.message ?? '') };
      default:
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Database error' };
    }
  }

  private parseCheckConstraint(detail: string): string {
    // Extract constraint name from detail like "Failing row contains (..., gender=invalid, ...)."
    // or from constraint name if available
    if (detail.includes('gender')) return 'Invalid gender value';
    if (detail.includes('dob') || detail.includes('age')) return 'Invalid date of birth (must be 18+)';
    if (detail.includes('verification_status')) return 'Invalid verification status';
    if (detail.includes('sect')) return 'Invalid sect value';
    if (detail.includes('marital_status')) return 'Invalid marital status';
    if (detail.includes('religious_practice_level')) return 'Invalid religious practice level';
    return 'Constraint violation';
  }

  private parseRaiseException(message: string): string {
    // Custom triggers raise with USING ERRCODE = 'check_violation' and message
    if (message.includes('under_min_age')) return 'You must be at least 18 years old';
    return message;
  }
}