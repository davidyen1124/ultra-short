import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../../src';

describe('CORS Integration Tests', () => {
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

		it('includes CORS headers in successful API responses', async () => {
			const request = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'https://www.google.com' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(201);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});

		it('includes CORS headers in error responses', async () => {
			const request = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'invalid-url' }),
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});

		it('includes CORS headers in redirect responses', async () => {
			// First create a short URL
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

			// Then test redirect has CORS headers
			const redirectRequest = new Request(`http://example.com/${shortCode}`);
			const ctx2 = createExecutionContext();
			const redirectResponse = await app.fetch(redirectRequest, env, ctx2);
			await waitOnExecutionContext(ctx2);

			expect(redirectResponse.status).toBe(307);
			expect(redirectResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});

		it('includes CORS headers in rate limit responses', async () => {
			const ip = '192.168.1.250';

			// Make 60 requests to exhaust rate limit
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
				await app.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);
			}

			// Rate limited request should still have CORS headers
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
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});

	describe('Error handling with CORS', () => {
		it('returns 404 for unknown routes with CORS headers', async () => {
			const request = new Request('http://example.com/unknown');
			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
			const result = (await response.json()) as any;
			expect(result.error).toBe('Not Found');
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});

		it('handles malformed JSON requests with CORS headers', async () => {
			const request = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'invalid-json{',
			});

			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});
});
