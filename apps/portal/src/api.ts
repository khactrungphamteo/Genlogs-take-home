import type { LaneQueryResponse } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

/** 422 — request shape is malformed (missing/blank origin or destination). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** 400 — well-formed but semantically invalid (origin/destination resolve to the same city). */
export class InvalidLaneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLaneError';
  }
}

/** The request never reached the backend, or the backend returned an unexpected status. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export async function fetchLanes(origin: string, destination: string): Promise<LaneQueryResponse> {
  const url = new URL('/lanes', API_BASE_URL);
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', destination);

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new NetworkError('Could not reach the lane-query service.');
  }

  if (response.status === 422) {
    throw new ValidationError(
      (await detailFrom(response)) ?? 'Origin and destination are required.',
    );
  }
  if (response.status === 400) {
    throw new InvalidLaneError(
      (await detailFrom(response)) ?? 'Origin and destination must be different cities.',
    );
  }
  if (!response.ok) {
    throw new NetworkError(`Lane-query service returned an unexpected error (${response.status}).`);
  }

  return (await response.json()) as LaneQueryResponse;
}

async function detailFrom(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      return typeof detail === 'string' ? detail : undefined;
    }
  } catch {
    // Response body wasn't JSON — fall through to the caller's default message.
  }
  return undefined;
}
