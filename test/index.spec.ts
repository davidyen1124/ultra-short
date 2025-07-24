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
				headers: { 
					'Content-Type': 'application/json',
					'CF-Connecting-IP': '192.168.1.200'
				},
				body: JSON.stringify({ url: 'https://www.google.com' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(201);
			expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy();
		});

		it('enforces rate limiting after 60 requests from same IP', async () => {
			const ip = '192.168.1.201';
			
			// Make 60 successful requests
			for (let i = 0; i < 60; i++) {
				const request = new Request('http://example.com/api/shorten', {
					method: 'POST',
					headers: { 
						'Content-Type': 'application/json',
						'CF-Connecting-IP': ip
					},
					body: JSON.stringify({ url: `https://test${i}.com` }),
				});

				const ctx = createExecutionContext();
				const response = await app.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);

				expect(response.status).toBe(201);
			}

			// 61st request should be rate limited
			const request = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'CF-Connecting-IP': ip
				},
				body: JSON.stringify({ url: 'https://should-fail.com' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(429);
			const result = await response.json() as any;
			expect(result.error).toBe('Rate limit exceeded');
			expect(result.retry_after).toBe(60);
		});

		it('tracks remaining requests correctly', async () => {
			const ip = '192.168.1.202';
			
			// First request should show 59 remaining
			const request1 = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'CF-Connecting-IP': ip
				},
				body: JSON.stringify({ url: 'https://test1.com' }),
			});

			const ctx1 = createExecutionContext();
			const response1 = await app.fetch(request1, env, ctx1);
			await waitOnExecutionContext(ctx1);

			expect(response1.status).toBe(201);
			expect(response1.headers.get('X-RateLimit-Remaining')).toBe('59');

			// Second request should show 58 remaining
			const request2 = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'CF-Connecting-IP': ip
				},
				body: JSON.stringify({ url: 'https://test2.com' }),
			});

			const ctx2 = createExecutionContext();
			const response2 = await app.fetch(request2, env, ctx2);
			await waitOnExecutionContext(ctx2);

			expect(response2.status).toBe(201);
			expect(response2.headers.get('X-RateLimit-Remaining')).toBe('58');
		});

		it('isolates rate limits per IP address', async () => {
			const ip1 = '192.168.1.203';
			const ip2 = '192.168.1.204';
			
			// Make 60 requests from IP1 to reach the limit
			for (let i = 0; i < 60; i++) {
				const request = new Request('http://example.com/api/shorten', {
					method: 'POST',
					headers: { 
						'Content-Type': 'application/json',
						'CF-Connecting-IP': ip1
					},
					body: JSON.stringify({ url: `https://ip1-test${i}.com` }),
				});

				const ctx = createExecutionContext();
				const response = await app.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);

				expect(response.status).toBe(201);
			}

			// IP1 should now be rate limited
			const request1 = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'CF-Connecting-IP': ip1
				},
				body: JSON.stringify({ url: 'https://ip1-fail.com' }),
			});

			const ctx1 = createExecutionContext();
			const response1 = await app.fetch(request1, env, ctx1);
			await waitOnExecutionContext(ctx1);

			expect(response1.status).toBe(429);

			// IP2 should still work fine with fresh rate limit
			const request2 = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 
					'Content-Type': 'application/json',
					'CF-Connecting-IP': ip2
				},
				body: JSON.stringify({ url: 'https://ip2-success.com' }),
			});

			const ctx2 = createExecutionContext();
			const response2 = await app.fetch(request2, env, ctx2);
			await waitOnExecutionContext(ctx2);

			expect(response2.status).toBe(201);
			expect(response2.headers.get('X-RateLimit-Remaining')).toBe('59');
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
			const request = new Request('http://example.com/nonexistent');
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
