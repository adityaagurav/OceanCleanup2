import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { MultiplayerServer } from './multiplayerServer.js';

/**
 * server/index.js — OceanCleanup.io Multiplayer Server Launcher
 */

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // IPv4 and non-internal
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  return addresses;
}

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Lifetime recycling points survive disconnects AND server restarts.
const LEADERBOARD_FILE =
  process.env.LEADERBOARD_FILE || fileURLToPath(new URL('./leaderboard-data.json', import.meta.url));

// Persistent player reports survive server restarts
const REPORTS_FILE =
  process.env.REPORTS_FILE || fileURLToPath(new URL('./reports-data.json', import.meta.url));

const server = new MultiplayerServer({
  port: PORT,
  host: HOST,
  leaderboardFile: LEADERBOARD_FILE,
  reportsFile: REPORTS_FILE,
});

server
  .start()
  .then(() => {
    const networkIps = getNetworkAddresses();
    console.log('\n========================================================');
    console.log('🌊 OceanCleanup.io Multiplayer Server — Phase 1 Active');
    console.log('========================================================');
    console.log(`  ➜ Local:   http://localhost:${PORT}`);
    if (networkIps.length > 0) {
      networkIps.forEach((ip) => {
        console.log(`  ➜ Network: http://${ip}:${PORT}`);
      });
    } else {
      console.log(`  ➜ Host:    http://${HOST}:${PORT}`);
    }
    console.log(`  ➜ Health:  http://localhost:${PORT}/health`);
    console.log('--------------------------------------------------------');
    console.log('  Ready for incoming player connections from this laptop');
    console.log('  and any other devices on the same Wi-Fi network.');
    console.log('========================================================\n');
  })
  .catch((err) => {
    console.error('Failed to start Multiplayer Server:', err);
    process.exit(1);
  });

// Handle graceful shutdown
const shutdown = async () => {
  console.log('\n[MultiplayerServer] Shutting down gracefully...');
  await server.stop();
  console.log('[MultiplayerServer] Server stopped. Goodbye!');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

