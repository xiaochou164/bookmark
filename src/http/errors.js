class AppError extends Error {
  constructor({ status = 500, code = 'INTERNAL_ERROR', message = 'Internal error', details = null, cause = null } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.cause = cause;
  }
}

function createError(status, code, message, details = null) {
  return new AppError({ status, code, message, details });
}

function badRequest(message = 'Bad request', details = null) {
  return createError(400, 'BAD_REQUEST', message, details);
}

function notFound(message = 'Not found', details = null) {
  return createError(404, 'NOT_FOUND', message, details);
}

function conflict(message = 'Conflict', details = null) {
  return createError(409, 'CONFLICT', message, details);
}

function unauthorized(message = 'Unauthorized', details = null) {
  return createError(401, 'UNAUTHORIZED', message, details);
}

function forbidden(message = 'Forbidden', details = null) {
  return createError(403, 'FORBIDDEN', message, details);
}

module.exports = {
  AppError,
  createError,
  badRequest,
  notFound,
  conflict,
  unauthorized,
  forbidden
};
