import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src';

describe('API Integration Tests', () => {
	beforeEach(async () => {
		// Clean up KV for each test
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
					'CF-Connecting-IP': '192.168.1.200',
				},
				body: JSON.stringify({ url: 'https://www.google.com' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(201);
			expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy();
		});
	});

	describe('Rate Limiting Integration', () => {
		it('enforces rate limiting after 60 requests from same IP', async () => {
			const ip = '192.168.1.201';

			// Make 60 successful requests
			for (let i = 0; i < 60; i++) {
				const request = new Request('http://example.com/api/shorten', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'CF-Connecting-IP': ip,
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
					'CF-Connecting-IP': ip,
				},
				body: JSON.stringify({ url: 'https://should-fail.com' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(429);
			const result = (await response.json()) as any;
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
					'CF-Connecting-IP': ip,
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
					'CF-Connecting-IP': ip,
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
						'CF-Connecting-IP': ip1,
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
					'CF-Connecting-IP': ip1,
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
					'CF-Connecting-IP': ip2,
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
});
