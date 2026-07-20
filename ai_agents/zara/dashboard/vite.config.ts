import path from 'node:path';

import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import { AccessToken } from 'livekit-server-sdk';
import { defineConfig, type Plugin } from 'vite';

// The agent and the dashboard share the same LiveKit credentials.
dotenv.config({ path: path.resolve(import.meta.dirname, '../.env.local') });
dotenv.config({ path: path.resolve(import.meta.dirname, '../.env') });

function tokenServer(): Plugin {
  return {
    name: 'zara-token-server',
    configureServer(server) {
      server.middlewares.use('/api/token', async (_req, res) => {
        const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
        if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error:
                'Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET in ../.env.local or ../.env',
            }),
          );
          return;
        }

        const suffix = Math.random().toString(36).slice(2, 8);
        const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
          identity: `user-${suffix}`,
          ttl: '15m',
        });
        token.addGrant({
          room: `zara-${suffix}`,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
        });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ url: LIVEKIT_URL, token: await token.toJwt() }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tokenServer()],
});
