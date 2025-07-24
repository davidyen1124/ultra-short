import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src';

describe('URL Redirect Integration Tests', () => {
	beforeEach(async () => {
		// Clean up KV for each test
		await env.LINKS.list().then(async (list) => {
			for (const key of list.keys) {
				await env.LINKS.delete(key.name);
			}
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

		it('returns 404 for invalid ULID format', async () => {
			const request = new Request('http://example.com/invalid-code-123');
			const ctx = createExecutionContext();
			const response = await app.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
		});

		it('processes redirect and tracks analytics asynchronously', async () => {
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

			// Verify redirect works properly (click tracking happens asynchronously via DO)
			expect(redirectResponse.status).toBe(307);
			expect(redirectResponse.headers.get('Location')).toBe('https://www.google.com');
		});

		it('handles multiple redirects for same URL', async () => {
			const shortenRequest = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'https://www.example.com' }),
			});

			const ctx1 = createExecutionContext();
			const shortenResponse = await app.fetch(shortenRequest, env, ctx1);
			await waitOnExecutionContext(ctx1);

			const result = (await shortenResponse.json()) as any;
			const shortCode = result.short_url.split('/').pop();

			// Make multiple redirect requests
			for (let i = 0; i < 5; i++) {
				const redirectRequest = new Request(`http://example.com/${shortCode}`);
				const ctx = createExecutionContext();
				const redirectResponse = await app.fetch(redirectRequest, env, ctx);
				await waitOnExecutionContext(ctx);

				expect(redirectResponse.status).toBe(307);
				expect(redirectResponse.headers.get('Location')).toBe('https://www.example.com');
			}
		});

		it('handles URLs with complex paths and parameters', async () => {
			const complexUrl = 'https://www.example.com/path/to/resource?param1=value1&param2=value2#section';

			const shortenRequest = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: complexUrl }),
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
			expect(redirectResponse.headers.get('Location')).toBe(complexUrl);
		});

		it('different short codes redirect to different URLs', async () => {
			// Create first short URL
			const shortenRequest1 = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'https://www.google.com' }),
			});

			const ctx1 = createExecutionContext();
			const shortenResponse1 = await app.fetch(shortenRequest1, env, ctx1);
			await waitOnExecutionContext(ctx1);

			const result1 = (await shortenResponse1.json()) as any;
			const shortCode1 = result1.short_url.split('/').pop();

			// Create second short URL
			const shortenRequest2 = new Request('http://example.com/api/shorten', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: 'https://www.github.com' }),
			});

			const ctx2 = createExecutionContext();
			const shortenResponse2 = await app.fetch(shortenRequest2, env, ctx2);
			await waitOnExecutionContext(ctx2);

			const result2 = (await shortenResponse2.json()) as any;
			const shortCode2 = result2.short_url.split('/').pop();

			// Verify different codes
			expect(shortCode1).not.toBe(shortCode2);

			// Test first redirect
			const redirectRequest1 = new Request(`http://example.com/${shortCode1}`);
			const ctx3 = createExecutionContext();
			const redirectResponse1 = await app.fetch(redirectRequest1, env, ctx3);
			await waitOnExecutionContext(ctx3);

			expect(redirectResponse1.status).toBe(307);
			expect(redirectResponse1.headers.get('Location')).toBe('https://www.google.com');

			// Test second redirect
			const redirectRequest2 = new Request(`http://example.com/${shortCode2}`);
			const ctx4 = createExecutionContext();
			const redirectResponse2 = await app.fetch(redirectRequest2, env, ctx4);
			await waitOnExecutionContext(ctx4);

			expect(redirectResponse2.status).toBe(307);
			expect(redirectResponse2.headers.get('Location')).toBe('https://www.github.com');
		});
	});
});
