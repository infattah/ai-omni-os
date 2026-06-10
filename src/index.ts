#!/usr/bin/env node
import { createServer } from './server/server.js';

const PORT = parseInt(process.env.OMNI_PORT || process.env.PORT || '3456', 10);

createServer(PORT).then((server) => {
  const url = `http://${server.host}:${server.port}/?token=${server.sessionToken}`;
  console.log('');
  console.log('  Omni is running (local-only).');
  console.log(`  Open the dashboard: ${url}`);
  console.log('  The token is your session key — keep the URL private.');
  console.log('');
});
