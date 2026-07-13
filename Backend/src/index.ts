//FixTrack Backend Server Entry Point
//Initializes HTTP server, database connection, applies middleware, and handles all API routes.
//Implements error handling for port conflicts and graceful shutdown.

import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { config } from './config/index.js';
import { connectDatabase } from './database/index.js';
import { applyCors } from './middlewares/cors.middleware.js';
import { applySecurityHeaders, enforceHttps } from './middlewares/security.middleware.js';
import { handleRoutes } from './routes/index.js';

// Every request gets HTTPS enforcement, Helmet headers, and CORS before reaching a route.
const requestListener = (request: IncomingMessage, response: ServerResponse) => {
  applySecurityHeaders(request, response);
  if (enforceHttps(request, response)) return;
  applyCors(request, response);
  void handleRoutes(request, response);
};

// Use supplied certificates for direct TLS; otherwise production expects a trusted TLS proxy.
const server = config.httpsKeyPath && config.httpsCertPath
  ? createHttpsServer({ key: readFileSync(config.httpsKeyPath), cert: readFileSync(config.httpsCertPath) }, requestListener)
  : createHttpServer(requestListener);

let activePort = config.port;

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    activePort += 1;
    console.warn(`Port ${activePort - 1} is already in use. Trying again on port ${activePort}.`);
    server.listen(activePort);
    return;
  }

  console.error(error);
  process.exit(1);
});

try {
  await connectDatabase();

  server.listen(activePort, () => {
    const protocol = config.httpsKeyPath && config.httpsCertPath ? 'https' : 'http';
    console.log(`${config.serviceName} running on ${protocol}://localhost:${activePort}`);
  });
} catch (error) {
  console.error('Failed to start backend:', error);
  process.exit(1);
}
