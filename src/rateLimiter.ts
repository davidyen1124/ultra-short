import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

interface Bucket {
	tokens: number;
	last: number; // epoch ms when we last wrote
}

export class RateLimiter extends DurableObject {
	private capacity: number;
	private refillPerMs: number;
	private idleTtlMs: number;
	private bucket!: Bucket; // populated in blockConcurrencyWhile

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.capacity = Number(env.RATE_CAPACITY) || 60;
		const windowSec = Number(env.RATE_WINDOW_SEC) || 60;
		this.idleTtlMs = (Number(env.IDLE_TTL_MIN) || 10) * 60_000;
		this.refillPerMs = this.capacity / (windowSec * 1000);

		// Prime in-memory cache from storage exactly once
		ctx.blockConcurrencyWhile(async () => {
			this.bucket = (await ctx.storage.get<Bucket>('bucket')) ?? { tokens: this.capacity, last: Date.now() };
		});
	}

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname !== '/check') {
			return new Response('Bad request', { status: 400 });
		}

		const now = Date.now();

		// Refill tokens based on elapsed time
		const elapsed = now - this.bucket.last;
		this.bucket.tokens = Math.min(this.capacity, this.bucket.tokens + elapsed * this.refillPerMs);
		this.bucket.last = now;

		if (this.bucket.tokens < 1) {
			const retryAfterMs = Math.ceil((1 - this.bucket.tokens) / this.refillPerMs);
			return Response.json({ allowed: false, remaining: 0, retry_after_ms: retryAfterMs }, { status: 429 });
		}

		// Consume one token and persist
		this.bucket.tokens -= 1;
		await this.ctx.storage.put('bucket', this.bucket);

		// Push idle cleanup alarm
		await this.ctx.storage.setAlarm(now + this.idleTtlMs);

		return Response.json({
			allowed: true,
			remaining: Math.floor(this.bucket.tokens),
		});
	}

	async alarm(): Promise<void> {
		// DO was idle long enough – wipe state and vanish
		await this.ctx.storage.deleteAll();
		await this.ctx.storage.deleteAlarm();
	}
}
