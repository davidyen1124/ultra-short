import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src';

describe('URL Shortener Worker', () => {
	beforeEach(async () => {
		await env.LINKS.list().then(async (list) => {
			for (const key of list.keys) {
				await env.LINKS.delete(key.name);
			}
		});
	});

	describe('POST /api/shorten', () => {
		it('creates a short URL for a valid URL', async () => {
			const request = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'https://www.google.com' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(201);
			const result = (await response.json()) as any;
			expect(result.short_url).toMatch(/^http:\/\/example\.com\/[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
		});

		it('normalizes URLs without protocol', async () => {
			const request = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'www.google.com' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(201);
		});

		it('rejects invalid URLs', async () => {
			const request = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'not-a-url' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);
			const result = (await response.json()) as any;
			expect(result.error).toBe('Invalid URL');
		});

		it('rejects requests without URL', async () => {
			const request = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);
			const result = (await response.json()) as any;
			expect(result.error).toBe('URL is required');
		});

		it('includes rate limit headers', async () => {
			const request = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'https://www.google.com' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(201);
			expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy();
		});
	});

	describe('GET /:code (redirect)', () => {
		it('redirects to the original URL', async () => {
			const shortenRequest = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'https://www.google.com' }),
			});

			const ctx1 = createExecutionContext();
			const shortenResponse = await app.fetch(shortenRequest, env, ctx1);
			await waitOnExecutionContext(ctx1);

			const result = (await shortenResponse.json()) as any;
			const shortCode = result.short_url.split('/').pop();

			const redirectRequest = new Request(`http://example.com/${shortCode}`);
			const ctx2 = createExecutionContext();
			const redirectResponse = await app.fetch(redirectRequest, env, ctx2);
			await waitOnExecutionContext(ctx2);

			expect(redirectResponse.status).toBe(307);
			expect(redirectResponse.headers.get('Location')).toBe('https://www.google.com');
		});

		it('returns 404 for non-existent codes', async () => {
			const request = new Request('http://example.com/nonexistent');
			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
		});

		it('updates click count', async () => {
			const shortenRequest = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'https://www.google.com' }),
			});

			const ctx1 = createExecutionContext();
			const shortenResponse = await app.fetch(shortenRequest, env, ctx1);
			await waitOnExecutionContext(ctx1);

			const result = (await shortenResponse.json()) as any;
			const shortCode = result.short_url.split('/').pop();

			const redirectRequest = new Request(`http://example.com/${shortCode}`);
			const ctx2 = createExecutionContext();
			await app.fetch(redirectRequest, env, ctx2);
			await waitOnExecutionContext(ctx2);

			await new Promise((resolve) => setTimeout(resolve, 100));

			const metaData = await env.LINKS.get(`meta:${shortCode}`);
			expect(metaData).toBeTruthy();
			const meta = JSON.parse(metaData!);
			expect(meta.clicks).toBe(1);
		});
	});

	describe('GET /status', () => {
		it('returns health check status', async () => {
			const request = new Request('http://example.com/status');
			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const result = (await response.json()) as any;
			expect(result.status).toBe('ok');
			expect(result.timestamp).toBeTruthy();
			expect(result.version).toBe('1.0.0');
		});
	});

	describe('CORS handling', () => {
		it('handles OPTIONS preflight requests', async () => {
			const request = new Request('http://example.com/api/shorten', {
				method: 'OPTIONS',
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(204);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
			expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST,OPTIONS');
		});

		it('includes CORS headers in API responses', async () => {
			const request = new Request('http://example.com/status');
			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});

	describe('Error handling', () => {
		it('returns 404 for unknown routes', async () => {
			const request = new Request('http://example.com/unknown');
			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
			const result = (await response.json()) as any;
			expect(result.error).toBe('Not Found');
		});
	});
});
