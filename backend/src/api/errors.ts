import type { FastifyReply } from "fastify";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(code: ApiErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function badRequest(message: string) {
  return new ApiError("BAD_REQUEST", message, 400);
}

export function notFound(message: string) {
  return new ApiError("NOT_FOUND", message, 404);
}

export function sendApiError(reply: FastifyReply, error: ApiError) {
  return reply.code(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
    },
  });
}

export function sendInternalError(reply: FastifyReply) {
  return reply.code(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
}
