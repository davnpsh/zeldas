# zeldas

**zeldas** is a simple bookmark/link manager for my HomeLab. Built with the DASH stack: **Deno** (with oak) + **Alpine.js** + **SQLite** (`node:sqlite`) + **HTMX**.

> [!CAUTION]  
> This application was built entirely using generative AI. This is due to my limited familiarity with web development, the low complexity of the request, my laziness and because no other tool out there fits my specific needs. This is meant as an experiment and for personal use.

## Deploy

With the [docker-compose.yml](./docker-compose.yml) file:

```yml
services:
  bookmarks:
    image: ghcr.io/davnpsh/zeldas:latest
    container_name: zeldas
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
```

## Development

With Docker, lift a hot-reloading dev environment:

```bash
docker compose -f docker-compose.dev.yml up --build
```

It runs with `DENO_ENV=development` and seeds ~100–200 demo links into an empty database, served at http://localhost:9000.
