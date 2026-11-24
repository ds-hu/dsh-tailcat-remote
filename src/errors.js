/** Errors that cross the control API with a stable code and HTTP status. */
export class RemoteAccessError extends Error {
  /**
   * @param {string} code - machine-readable reason.
   * @param {string} message - operator-facing text.
   * @param {number} [status] - HTTP status the control route should return.
   */
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'RemoteAccessError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Normalize any thrown value into an operator-facing message.
 * @param {unknown} error - thrown value.
 * @returns {string} text safe to show in the panel.
 */
export function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}
