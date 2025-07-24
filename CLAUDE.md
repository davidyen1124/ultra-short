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
- **Workers KV**: Key-value storage for URL mappings
- **Durable Objects**: Stateful objects for rate limiting and click tracking analytics
- **ULID**: Universally Unique Lexicographically Sortable Identifier for short URL generation
- **Vitest + @cloudflare/vitest-pool-workers**: Testing framework with Workers environment simulation

### Core Components

- **`src/index.ts`**: Main Worker request handler built with Hono, featuring:

  - `POST /api/shorten`: Creates short URLs with Durable Object-based rate limiting and validation
  - `GET /:code`: Redirects to original URLs with 307 status and tracks clicks asynchronously using LinkStats Durable Objects (validates ULID format)
  - Global CORS middleware for cross-origin requests
  - Global error handling with structured responses

- **`src/rateLimiter.ts`**: RateLimiter Durable Object class implementing:
  - Token bucket algorithm for rate limiting with configurable capacity and refill rate
  - Automatic idle cleanup with TTL-based storage deletion
  - Persistent state management across requests

- **`src/linkStats.ts`**: LinkStats Durable Object class for analytics:
  - Click counting and timestamp tracking per short URL
  - Persistent storage of click statistics
  - Fire-and-forget analytics updates

- **`src/types.ts`**: TypeScript type definitions for:

  - `Env`: Cloudflare Worker environment bindings including Durable Object namespaces and environment variables
  - `UrlMapping`: URL mapping data structure
  - `UrlMeta`: Click tracking metadata structure

- **`src/utils.ts`**: Utility functions including:
  - URL validation and normalization
  - Rate limiting integration with RateLimiter Durable Objects
  - Client IP extraction from Cloudflare headers (CF-Connecting-IP, X-Forwarded-For)

### Data Model

**KV Storage:**
- `id:<CODE>`: URL mapping `{ dest: string, created: string }`

**Durable Objects:**
- **RateLimiter**: Token bucket state `{ tokens: number, last: number }` with automatic idle cleanup
- **LinkStats**: Click analytics `{ clicks: number, last: string }` per short URL code

### Configuration

- **`wrangler.jsonc`**: Worker configuration with:
  - KV namespace binding `LINKS`
  - Durable Object bindings: `RATE_LIMITER` and `LINK_STATS`
  - Migration configuration for Durable Object classes
  - Environment variables: `RATE_CAPACITY`, `RATE_WINDOW_SEC`, `IDLE_TTL_MIN`
  - Static assets from `./public` directory via `assets.directory`
  - Observability enabled
  - Compatibility date and flags
  - Global fetch strict public compatibility flag
- **`worker-configuration.d.ts`**: TypeScript definitions for Worker environment
- **`vitest.config.mts`**: Test configuration using Cloudflare Workers pool
- **`test/`**: Test suite with environment definitions and spec files

### Features

- **Rate limiting**: Token bucket algorithm via Durable Objects with configurable capacity (default 60 requests per minute per IP) and automatic idle cleanup
- **URL validation and normalization**: Adds https:// if missing, validates hostname and protocol
- **Click tracking**: Fire-and-forget analytics updates using LinkStats Durable Objects with persistent click counts and timestamps
- **CORS support**: Cross-origin requests enabled for all endpoints
- **Error handling**: Structured error responses with appropriate HTTP status codes
- **Static file serving**: Serves static assets from public directory
- **ULID-based short codes**: Lexicographically sortable identifiers for better performance and ordering
