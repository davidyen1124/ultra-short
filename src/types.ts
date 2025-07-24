import type { RateLimiter } from './rateLimiter';
import type { LinkStats } from './linkStats';

export interface Env {
	LINKS: KVNamespace;
	RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
	LINK_STATS: DurableObjectNamespace<LinkStats>;
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
