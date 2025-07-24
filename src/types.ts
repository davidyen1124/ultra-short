import type { RateLimiter } from './rateLimiter';

export interface Env {
	LINKS: KVNamespace;
	RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
	RATE_CAPACITY: string;
	RATE_WINDOW_SEC: string;
	IDLE_TTL_MIN: string;
}

export interface UrlMapping {
	dest: string;
	created: string;
}

export interface UrlMeta {
	clicks: number;
	last: string;
}
