export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly headers: Record<string, string> = {},
    public readonly errors: Array<{ field: string; message: string }> = []
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
