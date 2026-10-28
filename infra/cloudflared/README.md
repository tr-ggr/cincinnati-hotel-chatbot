# Public access: Cloudflare Tunnel (or ngrok)

## Cloudflare Tunnel
1. Cloudflare Zero Trust dashboard -> Networks -> Tunnels -> Create a tunnel (type: Cloudflared). Name it e.g. `cincinnati-hotel`.
2. Copy the tunnel token into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`.
3. Add two public hostnames to the tunnel:
   - `hotel.<domain>` -> `http://web:80`
   - `n8n.<domain>`   -> `http://n8n:5678`
4. In `.env` set `N8N_HOST=n8n.<domain>` and `PUBLIC_WEB_HOST=hotel.<domain>`.
5. Start everything (production, no override file):

   ```
   docker compose --env-file .env -f infra/docker-compose.yml --profile tunnel up -d --build
   ```

n8n needs `N8N_WEBHOOK_URL` and `N8N_PROXY_HOPS=1` behind the tunnel (already set in `docker-compose.yml`).

## ngrok alternative
Run one ngrok agent with two tunnels (`web` -> `localhost:8080`, `n8n` -> `localhost:5678`), or two `ngrok http` processes
(`ngrok http 8080` and `ngrok http 5678`). Then set `N8N_HOST`, `N8N_WEBHOOK_URL` and `N8N_EDITOR_BASE_URL` for n8n
to the ngrok n8n hostname (e.g. via an extra compose override file) and restart n8n. Do not use `--profile tunnel`.
