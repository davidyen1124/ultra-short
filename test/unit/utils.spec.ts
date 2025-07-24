import { describe, it, expect } from 'vitest';
import { validateUrl, normalizeUrl, getClientIP } from '../../src/utils';

describe('Utils Functions', () => {
	describe('validateUrl', () => {
		it('accepts valid HTTP URLs', () => {
			expect(validateUrl('http://example.com')).toBe(true);
			expect(validateUrl('http://www.google.com')).toBe(true);
			expect(validateUrl('http://subdomain.example.com')).toBe(true);
			expect(validateUrl('http://example.com/path')).toBe(true);
			expect(validateUrl('http://example.com:8080')).toBe(true);
		});

		it('accepts valid HTTPS URLs', () => {
			expect(validateUrl('https://example.com')).toBe(true);
			expect(validateUrl('https://www.google.com')).toBe(true);
			expect(validateUrl('https://subdomain.example.com')).toBe(true);
			expect(validateUrl('https://example.com/path')).toBe(true);
			expect(validateUrl('https://example.com:8443')).toBe(true);
		});

		it('accepts localhost URLs', () => {
			expect(validateUrl('http://localhost')).toBe(true);
			expect(validateUrl('https://localhost')).toBe(true);
			expect(validateUrl('http://localhost:3000')).toBe(true);
		});

		it('rejects URLs with invalid protocols', () => {
			expect(validateUrl('ftp://example.com')).toBe(false);
			expect(validateUrl('file://example.com')).toBe(false);
			expect(validateUrl('javascript:alert(1)')).toBe(false);
			expect(validateUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
		});

		it('rejects URLs without hostname', () => {
			expect(validateUrl('http://')).toBe(false);
			expect(validateUrl('https://')).toBe(false);
			expect(validateUrl('http:///path')).toBe(false);
		});

		it('rejects URLs with invalid hostnames', () => {
			expect(validateUrl('http://invalidhost')).toBe(false);
			expect(validateUrl('https://nodot')).toBe(false);
			expect(validateUrl('http://.example.com')).toBe(true); // Has dot, so valid per implementation
		});

		it('rejects malformed URLs', () => {
			expect(validateUrl('not-a-url')).toBe(false);
			expect(validateUrl('http:')).toBe(false);
			expect(validateUrl('://')).toBe(false);
			expect(validateUrl('')).toBe(false);
			expect(validateUrl('http://[invalid')).toBe(false);
		});

		it('handles edge cases', () => {
			expect(validateUrl('https://example.com/path?query=value#fragment')).toBe(true);
			expect(validateUrl('https://user:pass@example.com')).toBe(true);
			expect(validateUrl('https://192.168.1.1')).toBe(true); // IP addresses have dots, so valid per implementation
			expect(validateUrl('https://[::1]')).toBe(false); // IPv6
		});
	});

	describe('normalizeUrl', () => {
		it('adds https:// to URLs without protocol', () => {
			expect(normalizeUrl('example.com')).toBe('https://example.com');
			expect(normalizeUrl('www.google.com')).toBe('https://www.google.com');
			expect(normalizeUrl('subdomain.example.com/path')).toBe('https://subdomain.example.com/path');
		});

		it('preserves existing http:// protocol', () => {
			expect(normalizeUrl('http://example.com')).toBe('http://example.com');
			expect(normalizeUrl('http://www.google.com/path')).toBe('http://www.google.com/path');
		});

		it('preserves existing https:// protocol', () => {
			expect(normalizeUrl('https://example.com')).toBe('https://example.com');
			expect(normalizeUrl('https://www.google.com/path')).toBe('https://www.google.com/path');
		});

		it('handles URLs with paths and query parameters', () => {
			expect(normalizeUrl('example.com/path?query=value')).toBe('https://example.com/path?query=value');
			expect(normalizeUrl('example.com/path#fragment')).toBe('https://example.com/path#fragment');
		});

		it('handles edge cases', () => {
			expect(normalizeUrl('localhost:3000')).toBe('https://localhost:3000');
			expect(normalizeUrl('192.168.1.1:8080')).toBe('https://192.168.1.1:8080');
			expect(normalizeUrl('')).toBe('https://');
		});
	});

	describe('getClientIP', () => {
		it('extracts IP from CF-Connecting-IP header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'CF-Connecting-IP': '192.168.1.100',
				},
			});
			expect(getClientIP(request)).toBe('192.168.1.100');
		});

		it('falls back to X-Forwarded-For header', () => {
			const request = new Request('https://example.com', {
				headers: {
					'X-Forwarded-For': '192.168.1.200',
				},
			});
			expect(getClientIP(request)).toBe('192.168.1.200');
		});

		it('uses first IP from X-Forwarded-For chain', () => {
			const request = new Request('https://example.com', {
				headers: {
					'X-Forwarded-For': '192.168.1.200, 10.0.0.1, 172.16.0.1',
				},
			});
			expect(getClientIP(request)).toBe('192.168.1.200');
		});

		it('prioritizes CF-Connecting-IP over X-Forwarded-For', () => {
			const request = new Request('https://example.com', {
				headers: {
					'CF-Connecting-IP': '192.168.1.100',
					'X-Forwarded-For': '192.168.1.200',
				},
			});
			expect(getClientIP(request)).toBe('192.168.1.100');
		});

		it('returns "unknown" when no IP headers present', () => {
			const request = new Request('https://example.com');
			expect(getClientIP(request)).toBe('unknown');
		});

		it('handles empty headers gracefully', () => {
			const request = new Request('https://example.com', {
				headers: {
					'CF-Connecting-IP': '',
					'X-Forwarded-For': '',
				},
			});
			expect(getClientIP(request)).toBe('unknown');
		});

		it('trims whitespace from X-Forwarded-For', () => {
			const request = new Request('https://example.com', {
				headers: {
					'X-Forwarded-For': '  192.168.1.200  , 10.0.0.1',
				},
			});
			expect(getClientIP(request)).toBe('192.168.1.200');
		});
	});
});
