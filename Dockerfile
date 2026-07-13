# ---- Build stage ----
FROM denoland/deno:debian-2.9.2 AS builder

WORKDIR /app

COPY deno.json deno.lock ./
COPY main.ts ./

RUN deno compile --allow-net \
    --allow-read \
    --allow-write \
    --allow-env \
    --output /app/zeldas \
    main.ts

# ---- Runtime stage ----
FROM debian:13-slim

WORKDIR /app

COPY --from=builder /app/zeldas /app/zeldas
COPY public ./public

ENV PORT=8000
EXPOSE 8000

ENTRYPOINT ["/app/zeldas"]
