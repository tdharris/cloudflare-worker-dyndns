// test/index.spec.ts
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/index.ts';

describe('Dynamic DNS Worker', () => {
	beforeEach(() => {
		// Mock the global fetch function
		global.fetch = vi.fn(async (input, init) => {
			const url = typeof input === 'string' ? input : input.url;

			// Mock responses for Cloudflare API endpoints
			switch (true) {
				case url.includes('/zones?name='):
					// Mock response for findZone
					return {
						ok: true,
						json: async () => ({
							result: [{ id: 'mock-zone-id', name: 'example.com' }],
						}),
					};

				case url.includes('/dns_records?name='):
					// Mock response for findRecord
					return {
						ok: true,
						json: async () => ({
							result: [{ id: 'mock-record-id', name: 'example.com', zone_id: 'mock-zone-id' }],
						}),
					};

				case url.includes('/dns_records/'):
					// Mock response for updateRecord
					return {
						ok: true,
						json: async () => ({
							result: [{ id: 'mock-record-id', name: 'example.com', content: '1.2.3.4' }],
						}),
					};

				case url.includes('/user/tokens/verify'):
					return {
						ok: true,
						json: async () => ({
							success: true,
							result: { status: 'active' },
						}),
					};

				default:
					// Default mock response for other URLs
					return {
						ok: false,
						status: 404,
						json: async () => ({}),
					};
			}
		});
	});

	afterEach(() => {
		// Restore the original fetch function
		vi.resetAllMocks();
	});

	it('should return 200 on successful update', async () => {
		const request = new Request('https://example.com/nic/update?hostname=example.com&ip=1.2.3.4', {
			headers: {
				Authorization: 'Basic ' + btoa('username:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('good');
	});

	it('should return 400 if hostname is missing', async () => {
		const request = new Request('https://example.com/nic/update?ip=1.2.3.4', {
			headers: {
				Authorization: 'Basic ' + btoa('username:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await worker.fetch(request, env, {});
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('You must specify a hostname');
	});

	it('should return 400 if IP is missing', async () => {
		const request = new Request('https://example.com/nic/update?hostname=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('username:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await worker.fetch(request, env, {});
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('You must specify an ip address');
	});

	it('should return 401 if authorization is missing', async () => {
		const request = new Request('https://example.com/nic/update?hostname=example.com&ip=1.2.3.4', {
			headers: {
				'x-forwarded-proto': 'https',
			},
		});
		const response = await worker.fetch(request, env, {});
		expect(response.status).toBe(401);
		expect(await response.text()).toContain('Please provide valid credentials.');
	});

	it('should return 400 on non-HTTPS requests', async () => {
		const request = new Request('http://example.com/nic/update?hostname=example.com&ip=1.2.3.4', {
			headers: {
				Authorization: 'Basic ' + btoa('username:password'),
				'x-forwarded-proto': 'http',
			},
		});
		const response = await worker.fetch(request, env, {});
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('Please use a HTTPS connection.');
	});

	it('should return 404 for unknown paths', async () => {
		const request = new Request('https://example.com/unknown', {
			headers: {
				'x-forwarded-proto': 'https',
			},
		});
		const response = await worker.fetch(request, env, {});
		expect(response.status).toBe(404);
		expect(await response.text()).toBe('Not Found.');
	});

	it('should return 204 for /favicon.ico', async () => {
		const request = new Request('https://example.com/favicon.ico', {
			headers: {
				'x-forwarded-proto': 'https',
			},
		});
		const response = await worker.fetch(request, env, {});
		expect(response.status).toBe(204);
	});

	it('should return 204 for /robots.txt', async () => {
		const request = new Request('https://example.com/robots.txt', {
			headers: {
				'x-forwarded-proto': 'https',
			},
		});
		const response = await worker.fetch(request, env, {});
		expect(response.status).toBe(204);
	});
});
