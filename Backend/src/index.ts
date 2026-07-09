import { createServer } from 'node:http';
import { config } from './config/index.js';
import { connectDatabase } from './database/index.js';
import { applyCors } from './middlewares/cors.middleware.js';
import { handleRoutes } from './routes/index.js';

const server = createServer((request, response) => {
  applyCors(request, response);
  void handleRoutes(request, response);
});

let activePort = config.port;

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    activePort += 1;
    console.warn(`Port ${activePort - 1} is already in use. Trying http://localhost:${activePort} instead.`);
    server.listen(activePort);
    return;
  }

  console.error(error);
  process.exit(1);
});

try {
  await connectDatabase();

  server.listen(activePort, () => {
    console.log(`${config.serviceName} running on http://localhost:${activePort}`);
  });
} catch (error) {
  console.error('Failed to start backend:', error);
  process.exit(1);
}
