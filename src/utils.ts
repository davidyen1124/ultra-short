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

export async function checkRateLimit(ip: string, env: KVNamespace): Promise<{ allowed: boolean; remaining: number }> {
	const key = `user:${ip}:count`;
	const limit = 60;
	const window = 60;

	const current = await env.get(key);
	const count = current ? parseInt(current) : 0;

	if (count >= limit) {
		return { allowed: false, remaining: 0 };
	}

	const newCount = count + 1;
	await env.put(key, newCount.toString(), { expirationTtl: window });

	return { allowed: true, remaining: limit - newCount };
}
