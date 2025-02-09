// test/index.spec.ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Cloudflare } from 'cloudflare';

const mockVerify = vi.fn();
const mockListZones = vi.fn();
const mockListRecords = vi.fn();
const mockEditRecord = vi.fn();

vi.mock('cloudflare', () => {
	return {
		Cloudflare: vi.fn().mockImplementation(() => ({
			user: {
				tokens: {
					verify: mockVerify,
				},
			},
			zones: {
				list: mockListZones,
			},
			dns: {
				records: {
					list: mockListRecords,
					edit: mockEditRecord,
				},
			},
		})),
	};
});

describe('updateDNSRecord', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 400 if hostname is missing', async () => {
		const request = new Request('https://example.com/update?ip=1.2.3.4&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('testuser:testpass'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('You must specify a hostname');
	});

	it('should return 400 if IP is missing', async () => {
		const request = new Request('https://example.com/update?hostname=dns.example.com&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('testuser:testpass'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('You must specify an ip address');
	});

	it('should return 401 if authorization is missing', async () => {
		const request = new Request('https://example.com/update?hostname=dns.example.com&ip=1.2.3.4&zone=example.com', {
			headers: {
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(401);
		expect(await response.text()).toContain('Please provide valid credentials.');
	});

	it('should return 401 if token is inactive', async () => {
		mockVerify.mockResolvedValueOnce({ status: 'inactive' });
		mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id' }] });
		mockEditRecord.mockResolvedValueOnce({});
		const request = new Request('https://example.com/update?hostname=dns.example.com&ip=1.2.3.4&zone=example.com', {
			headers: {
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(401);
	});

	it('should return 400 on non-HTTPS requests', async () => {
		const request = new Request('http://example.com/update?hostname=dns.example.com&ip=1.2.3.4&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('testuser:testpass'),
				'x-forwarded-proto': 'http',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('Please use a HTTPS connection.');
	});

	it('should return 404 for unknown paths', async () => {
		const request = new Request('https://example.com/unknown', {
			headers: {
				Authorization: 'Basic ' + btoa('testuser:testpass'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe('Not Found.');
	});

	it('should return 204 for /favicon.ico', async () => {
		const request = new Request('https://example.com/favicon.ico', {
			headers: { 'x-forwarded-proto': 'https' },
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(204);
	});

	it('should return 204 for /robots.txt', async () => {
		const request = new Request('https://example.com/robots.txt', {
			headers: { 'x-forwarded-proto': 'https' },
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(204);
	});

	// it('should return 200 on successful update', async () => {
	// 	mockVerify.mockResolvedValueOnce({ status: 'active' });
	// 	mockListZones.mockResolvedValueOnce({ result: [{ id: 'zone-id' }] });
	// 	mockListRecords.mockResolvedValueOnce({ result: [{ id: 'record-id' }] });
	// 	mockEditRecord.mockResolvedValueOnce({ result: { id: 'record-id' } });

	// 	const request = new Request('https://example.com/update?hostname=dns.example.com&ip=1.2.3.4&zone=example.com', {
	// 		headers: {
	// 			Authorization: 'Basic ' + btoa('testuser:testpass'),
	// 			'x-forwarded-proto': 'https',
	// 		},
	// 	});
	// 	const response = await SELF.fetch(request);
	// 	expect(response.status).toBe(200);
	// });
});
