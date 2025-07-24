import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { isValid } from 'ulid';
import type { Env, UrlMapping, UrlMeta } from './types';
import { validateUrl, normalizeUrl, getClientIP, checkRateLimit } from './utils';
import { ulid } from 'ulid';
export { RateLimiter } from './rateLimiter';
export { LinkStats } from './linkStats';

const app = new Hono<{ Bindings: Env }>();

app.use(
	'*',
	cors({
		origin: '*',
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
	})
);

app.onError((err, c) => {
	console.error('Unhandled error:', err);
	return c.json({ error: 'Internal Server Error' }, 500);
});

app.post('/api/shorten', async (c) => {
	try {
		const { url } = await c.req.json<{ url: string }>();

		if (!url) {
			return c.json({ error: 'URL is required' }, 400);
		}

		const normalizedUrl = normalizeUrl(url);
		if (!validateUrl(normalizedUrl)) {
			return c.json({ error: 'Invalid URL' }, 400);
		}

		const clientIP = getClientIP(c.req.raw);
		const { allowed, remaining } = await checkRateLimit(clientIP, c.env.RATE_LIMITER);

		if (!allowed) {
			return c.json({ error: 'Rate limit exceeded', retry_after: 60 }, 429, { 'Retry-After': '60' });
		}

		const shortId = ulid();
		const mapping: UrlMapping = {
			dest: normalizedUrl,
			created: new Date().toISOString(),
		};

		await c.env.LINKS.put(`id:${shortId}`, JSON.stringify(mapping));

		const shortUrl = `${new URL(c.req.url).origin}/${shortId}`;

		return c.json({ short_url: shortUrl }, 201, { 'X-RateLimit-Remaining': remaining.toString() });
	} catch (error) {
		return c.json({ error: 'Invalid request body' }, 400);
	}
});

app.get('/:code', async (c) => {
	const { code } = c.req.param();

	if (!code || !isValid(code)) {
		return c.notFound();
	}

	const mappingData = await c.env.LINKS.get(`id:${code}`);
	if (!mappingData) {
		return c.json({ error: 'Short URL not found' }, 404);
	}

	try {
		const mapping: UrlMapping = JSON.parse(mappingData);

		// Fire-and-forget click analytics
		c.executionCtx.waitUntil(updateClickCount(code, c.env));

		return c.redirect(mapping.dest, 307);
	} catch (error) {
		return c.text('Invalid URL mapping', 500);
	}
});

app.notFound((c) => {
	return c.json({ error: 'Not Found' }, 404);
});

async function updateClickCount(code: string, env: Env): Promise<void> {
	try {
		const stub = env.LINK_STATS.get(env.LINK_STATS.idFromName(code));
		await stub.fetch('https://unused/increment', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('Failed to update click count:', {
			code,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			timestamp: new Date().toISOString(),
		});
	}
}

export default app;
