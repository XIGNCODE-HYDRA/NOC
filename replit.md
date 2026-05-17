# MikroTik NOC Dashboard

A real-time Network Operations Center (NOC) dashboard for monitoring MikroTik router bandwidth. Supports multiple devices, selective interface monitoring, live bandwidth charts, and a futuristic dark command-center UI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/noc-dashboard run dev` — run the frontend (port 21749)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — Session signing secret

## Default Login

- **Username:** `admin`
- **Password:** `admin123`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, Recharts, Framer Motion, Wouter
- API: Express 5 + express-session + bcryptjs
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- MikroTik: `node-routeros` library (RouterOS API protocol on port 8728)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle table definitions (users, devices, monitored_interfaces, bandwidth_history)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/mikrotik.ts` — MikroTik RouterOS API integration
- `artifacts/api-server/src/lib/crypto.ts` — Password hashing + device password encryption
- `artifacts/noc-dashboard/src/pages/` — React pages (login, dashboard, devices, interfaces, bandwidth)
- `artifacts/noc-dashboard/src/lib/auth.tsx` — Auth context / session management
- `VPS_HOSTING_GUIDE.md` — Full VPS deployment documentation

## Architecture decisions

- Session-based auth (express-session + bcryptjs) for VPS portability — no external auth service required
- Device passwords are encrypted at rest using XOR + SESSION_SECRET before DB storage
- Background poller in `bandwidth.ts` fetches MikroTik traffic stats every 5 seconds and stores history
- Live bandwidth cache (in-memory Map) allows instant reads for the `/bandwidth/live` endpoint
- `node-routeros` is externalized from esbuild bundle due to `source-map-support` dependency

## Product

- Add multiple MikroTik routers with credentials
- Test connectivity per device; status auto-updates (online/offline)
- Selectively add interfaces from any device to the monitoring list
- Live bandwidth dashboard refreshes every 3-5 seconds
- Per-interface bandwidth history chart (60-minute rolling window)
- Alert count when interfaces exceed configured threshold (Mbps)

## User preferences

- Futuristic, dark NOC aesthetic — electric cyan on near-black
- Node.js + React stack
- GitHub-deployable, VPS-compatible (no cloud-vendor lock-in)

## Gotchas

- `node-routeros` must be in the esbuild `external` list (uses `source-map-support` internally)
- MikroTik devices must have the API service enabled on port 8728
- Frontend `credentials: "include"` is set in `lib/api-client-react/src/custom-fetch.ts` for cookie auth
- Production deployment: set `NODE_ENV=production` so session cookies use `secure: true`
- The bandwidth poller starts automatically when the API server starts (no separate process needed)

## Pointers

- See `VPS_HOSTING_GUIDE.md` for full VPS/Nginx/SSL deployment instructions
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
