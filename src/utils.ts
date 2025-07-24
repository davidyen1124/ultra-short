import type { RateLimiter } from './rateLimiter';

export function validateUrl(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			return false;
		}
		if (!parsedUrl.hostname || parsedUrl.hostname.length === 0) {
			return false;
		}
		if (!parsedUrl.hostname.includes('.') && parsedUrl.hostname !== 'localhost') {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

export function normalizeUrl(url: string): string {
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		return 'https://' + url;
	}
	return url;
}

export function getClientIP(request: Request): string {
	return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}

export async function checkRateLimit(
	ip: string,
	rlNs: DurableObjectNamespace<RateLimiter>
): Promise<{ allowed: boolean; remaining: number }> {
	const stub = rlNs.get(rlNs.idFromName(ip));
	const res = await stub.fetch('https://unused/check');
	if (!res.ok && res.status !== 429) {
		throw new Error('Rate limiter failed');
	}
	return res.json();
}
