# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `npm run dev` - Starts Wrangler dev server for local development
- **Alternative dev**: `npm start` - Alias for `npm run dev`
- **Deploy**: `npm run deploy` - Deploys the Worker to Cloudflare
- **Tests**: `npm test` - Runs Vitest test suite with Cloudflare Workers testing environment
- **Type generation**: `npm run cf-typegen` - Generates Cloudflare Worker type definitions using `wrangler types`

## Architecture Overview

This is a Cloudflare Workers-based URL shortener service built with the Hono framework that uses:

- **Cloudflare Workers**: Edge compute runtime for handling requests
- **Hono**: Fast, lightweight web framework for edge environments
- **Workers KV**: Key-value storage for URL mappings and metadata
- **ULID**: Universally Unique Lexicographically Sortable Identifier for short URL generation
- **Vitest + @cloudflare/vitest-pool-workers**: Testing framework with Workers environment simulation

### Core Components

- **`src/index.ts`**: Main Worker request handler built with Hono, featuring:
  - `POST /api/shorten`: Creates short URLs with rate limiting and validation
  - `GET /:code`: Redirects to original URLs with 307 status and tracks clicks asynchronously (validates ULID format)
  - `GET /status`: Health check endpoint that tests KV availability
  - Global CORS middleware for cross-origin requests
  - Global error handling with structured responses

- **`src/types.ts`**: TypeScript type definitions for:
  - `Env`: Cloudflare Worker environment bindings
  - `UrlMapping`: URL mapping data structure
  - `UrlMeta`: Click tracking metadata structure

- **`src/utils.ts`**: Utility functions including:
  - Short ID generation using ULID (Universally Unique Lexicographically Sortable Identifier)
  - URL validation and normalization
  - Rate limiting implementation with KV-based counters and TTL expiration
  - Client IP extraction from Cloudflare headers (CF-Connecting-IP, X-Forwarded-For)

### Data Model (KV Storage)

- `id:<CODE>`: URL mapping `{ dest: string, created: string }`
- `meta:<CODE>`: Click tracking `{ clicks: number, last: string }`
- `user:<IP>:count`: Rate limiting counter (60 requests/min, TTL 60s)

### Configuration

- **`wrangler.jsonc`**: Worker configuration with:
  - KV namespace binding `LINKS`
  - Static assets from `./public` directory via `assets.directory`
  - Observability enabled
  - Compatibility date and flags
  - Global fetch strict public compatibility flag
- **`worker-configuration.d.ts`**: TypeScript definitions for Worker environment
- **`vitest.config.mts`**: Test configuration using Cloudflare Workers pool
- **`test/`**: Test suite with environment definitions and spec files

### Features

- Rate limiting: 60 requests per minute per IP address with automatic TTL expiration
- URL validation and normalization (adds https:// if missing)
- Click tracking with fire-and-forget analytics updates
- CORS support for cross-origin requests
- Error handling with appropriate HTTP status codes
- Static file serving from public directory
- Health monitoring via /status endpoint