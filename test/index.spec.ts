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

	it('should return 400 on non-HTTPS requests', async () => {
		const request = new Request('http://example.com/update?hostname=dns.example.com&ip=1.2.3.4&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('user@example.com:password'),
				'x-forwarded-proto': 'http',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('Please use a HTTPS connection.');
	});

	it('should return 400 if hostname is missing', async () => {
		const request = new Request('https://example.com/update?ip=1.2.3.4&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('user@example.com:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('You must specify a hostname');
	});

	it('should return 400 if ip is missing', async () => {
		const request = new Request('https://example.com/update?hostname=dns.example.com&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('user@example.com:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('You must specify an ip address');
	});

	it('should return 400 if zone is missing', async () => {
		const request = new Request('https://example.com/update?ip=1.2.3.4&hostname=dns.example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('user@example.com:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('You must specify a zone name');
	});

	it('should return 400 if multiple DNS records are found', async () => {
		mockVerify.mockResolvedValue({ status: 'active' });
		mockListZones.mockResolvedValue({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValue({ result: [{ id: 'record-id' }, { id: 'record-id' }] });

		const request = new Request('https://example.com/update?hostname=dns.example.com&ip=1.2.3.4&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('user@example.com:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('Failed to find unique DNS record');
	});

	it('should return 400 if no DNS records are found', async () => {
		mockVerify.mockResolvedValue({ status: 'active' });
		mockListZones.mockResolvedValue({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValue({ result: []});

		const request = new Request('https://example.com/update?hostname=dns.example.com&ip=1.2.3.4&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('user@example.com:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('Failed to find DNS record');
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
		mockVerify.mockResolvedValue({ status: 'inactive' });
		const request = new Request('https://example.com/update?hostname=dns.example.com&ip=1.2.3.4&zone=example.com', {
			headers: {
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(401);
	});

	it('should return 404 for unknown paths', async () => {
		const request = new Request('https://example.com/unknown', {
			headers: {
				Authorization: 'Basic ' + btoa('user@example.com:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe('Not Found.');
	});

	it('should return 500 for an unknown error', async () => {
		mockVerify.mockRejectedValueOnce(new Error('Unknown error'));
		const request = new Request('https://example.com/update?ip=1.2.3.4&hostname=dns.example.com&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('user@example.com:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);

		expect(response.status).toBe(500);
		expect(response.statusText).toBe('Internal Server Error');
		expect(await response.text()).toContain('Unknown Error');
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

	it('should return 200 on successful update', async () => {
		mockVerify.mockResolvedValue({ status: 'active' });
		mockListZones.mockResolvedValue({ result: [{ id: 'zone-id' }] });
		mockListRecords.mockResolvedValue({ result: [{ id: 'record-id' }] });
		mockEditRecord.mockResolvedValue({ result: { id: 'record-id' } });

		const request = new Request('https://example.com/update?ip=1.2.3.4&hostname=dns.example.com&zone=example.com', {
			headers: {
				Authorization: 'Basic ' + btoa('user@example.com:password'),
				'x-forwarded-proto': 'https',
			},
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(200);
	});
});
