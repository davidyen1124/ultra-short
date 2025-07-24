import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

interface ClickData {
	clicks: number;
	last: string;
}

export class LinkStats extends DurableObject {
	private data!: ClickData;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		// Prime in-memory cache from storage exactly once
		ctx.blockConcurrencyWhile(async () => {
			this.data = (await ctx.storage.get<ClickData>('stats')) ?? {
				clicks: 0,
				last: new Date().toISOString(),
			};
		});
	}

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		
		if (req.method !== 'POST' || url.pathname !== '/increment') {
			return new Response('Bad request', { status: 400 });
		}

		// Increment click count and update timestamp
		this.data.clicks += 1;
		this.data.last = new Date().toISOString();

		// Persist to storage
		await this.ctx.storage.put('stats', this.data);

		return Response.json({
			clicks: this.data.clicks,
			last: this.data.last,
		});
	}
}