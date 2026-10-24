/** The API key that authenticated the current request (set by `requireApiKey`). */
export interface AuthenticatedKey {
  id: string;
  name: string;
  prefix: string;
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: AuthenticatedKey;
    }
  }
}
