# Anker

One step at a time. A personal focus app: capture tasks, break them into small steps, work on
one step in 25-minute blocks, and end the workday on purpose.

Product and architecture: [BRIEF.md](BRIEF.md). Working conventions: [CLAUDE.md](CLAUDE.md).

## Develop

```sh
pnpm install
pnpm dev        # API on :3000 (node --watch), Vite on :5173 with /api proxied
pnpm check      # lint + format + typecheck + tests
```

Handy for testing the timer: `FOCUS_MINUTES=1 pnpm dev`.

## Deploy (homelab, behind SWAG)

1. **Configure**

   ```sh
   cp .env.example .env      # set SWAG_NETWORK if SWAG's network isn't called "swag"
   mkdir -p data             # must be writable by uid 1000 (the container's `node` user)
   ```

   Find SWAG's network name with `docker inspect swag --format '{{json .NetworkSettings.Networks}}'`.

2. **Start**

   ```sh
   docker compose up -d --build
   ```

   The container publishes no ports. SWAG reaches it at `http://anker:3000`.

3. **SWAG proxy + basic auth**

   ```sh
   cp docker/anker.subdomain.conf <swag-config>/nginx/proxy-confs/
   docker exec -it swag htpasswd -c /config/nginx/.htpasswd-anker <username>
   docker restart swag
   ```

   Make sure `anker.<your-domain>` is covered by SWAG's certificate (`SUBDOMAINS` or a wildcard).

4. **Install on your phone:** open `https://anker.<your-domain>`, log in, then choose
   "Add to Home screen" (Android Chrome) or Share → "Add to Home Screen" (iOS Safari).

### Production (anker.onsnet.nz)

Production runs from a clone of this repo at `/docker/anker`. It is the `anker` service in the
host's main `/docker/docker-compose.yml` (on SWAG's `onsnet` network), not this repo's `compose.yaml`.
The data lives in `/docker/anker/data/anker.db`. The live SWAG conf is
`/docker/swag/config/nginx/proxy-confs/anker.subdomain.conf`. Basic auth is **off there for now**
while testing (see BRIEF §2).

To update prod after any change, commit and push, then:

```sh
cd /docker/anker && git pull
cd /docker && docker compose up -d --build anker
```

### If SWAG is not in Docker on the same host

Replace the `networks:` block in `compose.yaml` with `ports: ['127.0.0.1:3000:3000']`
(or the host's LAN IP, firewalled to the SWAG host), and point `$upstream_app` at that host.

## Backup and restore

- **Download a JSON export:** Inbox → "Export backup (JSON)", or `GET /api/export`.
- **Full backup to the volume** (SQLite `.backup` + JSON, keeps the newest 14):

  ```sh
  docker compose exec anker node src/server/backup.ts
  ```

  For a nightly run, add this to the host's crontab:
  `0 5 * * * cd /path/to/anker && docker compose exec -T anker node src/server/backup.ts`

- **Restore:**

  ```sh
  docker compose stop anker
  cp data/backups/anker-<stamp>.db data/anker.db && rm -f data/anker.db-wal data/anker.db-shm
  docker compose start anker
  ```

## Configuration

| Env             | Default            | Meaning                                              |
| --------------- | ------------------ | ---------------------------------------------------- |
| `TZ_DISPLAY`    | `Pacific/Auckland` | Time zone for "today" and the cutoff                 |
| `DAY_CUTOFF`    | `04:00`            | An open workday is closed quietly at this local time |
| `FOCUS_MINUTES` | `25`               | Length of a focus block                              |
| `SWAG_NETWORK`  | `swag`             | Docker network shared with SWAG (compose only)       |
| `DATA_DIR`      | `./data`           | Where `anker.db` lives (`/data` in the container)    |
| `PORT`          | `3000`             | HTTP port                                            |
