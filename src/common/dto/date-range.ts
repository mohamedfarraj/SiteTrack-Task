import { BadRequestException } from '@nestjs/common';

/** Rejects a range whose start is after its end (both inclusive "YYYY-MM-DD"). */
export function assertDateOrder(start: string | undefined, end: string | undefined, what = 'date range'): void {
  if (start && end && start > end) {
    throw new BadRequestException(`Invalid ${what}: start must be on or before end`);
  }
}
