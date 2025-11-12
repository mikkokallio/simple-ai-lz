// Type extensions for Express
declare global {
  namespace Express {
    interface User {
      oid: string;        // Object ID (unique user identifier)
      email?: string;     // User's email
      name?: string;      // User's display name
      upn?: string;       // User Principal Name
      tid?: string;       // Tenant ID
    }
  }
}

export {};
