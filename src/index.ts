import { Cloudflare, ClientOptions } from 'cloudflare'; // Import the official Cloudflare library

type UpdateRecordRequest = {
	hostname: string;
	ip: string;
	zoneName: string;
}

/**
 * Receives a HTTP request and replies with a response.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleRequest(request) {
	const { protocol, pathname } = new URL(request.url);

	// Require HTTPS (TLS) connection to be secure.
	if ('https:' !== protocol || 'https' !== request.headers.get('x-forwarded-proto')) {
		throw new BadRequestException('Please use a HTTPS connection.');
	}

	switch (pathname) {
		case '/nic/update':
		case '/update':
			if (request.headers.has('Authorization')) {
				const { username, password } = parseBasicAuthentication(request);
				const cloudflareClientOptions = { apiEmail: username, apiToken: password };

				// Throws exception when query parameters aren't formatted correctly
				const url = new URL(request.url);
				const updateRecordRequest = parseSearchParams(url);

				return await updateDNSRecord(updateRecordRequest, cloudflareClientOptions);
			}

			throw new UnauthorizedException('Please provide valid credentials.');

		case '/favicon.ico':
		case '/robots.txt':
			return new Response(null, { status: 204 });
	}

	return new Response('Not Found.', { status: 404 });
}

/**
 * Pass the request info to the Cloudflare API Handler
 * @param {URL} url
 * @param {String} name
 * @param {String} token
 * @returns {Promise<Response>}
 */
async function updateDNSRecord({
	hostname,
	ip,
	zoneName
}: UpdateRecordRequest, clientOptions: ClientOptions) {
	// Initialize Cloudflare API client
	const cloudflare = new Cloudflare(clientOptions);

	// Verify token
	const user = await cloudflare.user.tokens.verify();
	if (user.status !== 'active') {
		throw new UnauthorizedException('Invalid token.');
	}

	// Find zone
	console.log(`INFO Searching for zone '${zoneName}'`);
	const zones = (await cloudflare.zones.list({ name: zoneName })).result;
	if (zones.length > 1) {
		throw new BadRequestException(`Failed to find unique zone '${zoneName}'`);
	} else if (zones.length === 0) {
		throw new BadRequestException(`Failed to find zone '${zoneName}'`);
	}
	const zone = zones[0];
	console.log(`INFO Found zone '${zone.name}'`);

	// Find DNS record
	console.log(`INFO Searching for record '${hostname}'`);
	const records = (await cloudflare.dns.records.list({
		zone_id: zone.id,
		name: hostname as any,
	})).result;
	if (records.length > 1) {
		throw new BadRequestException(`Failed to find unique DNS record '${hostname}'`);
	} else if (records.length === 0 || records[0].id === undefined) {
		throw new BadRequestException(`Failed to find DNS record '${hostname}'`);
	}
	const record = records[0];
	console.log(`INFO Found record '${record.name}'`);

	// Update DNS record
	console.log(`INFO Updating record '${record.name}' to '${ip}'`);
	await cloudflare.dns.records.edit(record.id, {
		zone_id: zone.id,
		content: ip,
	});
	console.log(`INFO Updated record '${record.name}' to '${ip}'`);

	// Only returns this response when no exception is thrown.
	return new Response(`good`, {
		status: 200,
		headers: {
			'Content-Type': 'text/plain;charset=UTF-8',
			'Cache-Control': 'no-store',
		},
	});
}

/**
 * Throws exception on verification failure.
 * @param {string} url
 * @throws {UnauthorizedException}
 */
function parseSearchParams(url: URL): UpdateRecordRequest {
	if (!url.searchParams) {
		throw new BadRequestException('You must include proper query parameters');
	}

	const hostname = url.searchParams.get('hostname');
	const ip = url.searchParams.get('ip') || url.searchParams.get('myip');
	const zone = url.searchParams.get('zone');

	if (!hostname) {
		throw new BadRequestException('You must specify a hostname');
	}
	if (!ip) {
		throw new BadRequestException('You must specify an ip address');
	}
	if (!zone) {
		throw new BadRequestException('You must specify a zone name');
	}

	return { hostname, ip, zoneName: zone };
}

/**
 * Parse HTTP Basic Authorization value.
 * @param {Request} request
 * @throws {UnauthorizedException}
 * @returns {{ username: string, password: string }}
 */
function parseBasicAuthentication(request) {
	const Authorization = request.headers.get('Authorization');

	const [scheme, encoded] = Authorization.split(' ');

	// Decodes the base64 value and performs unicode normalization.
	// @see https://dev.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
	const buffer = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
	const decoded = new TextDecoder().decode(buffer).normalize();

	// The username & password are split by the first colon.
	//=> example: "username:password"
	const index = decoded.indexOf(':');

	// The user & password are split by the first colon and MUST NOT contain control characters.
	// @see https://tools.ietf.org/html/rfc5234#appendix-B.1 (=> "CTL = %x00-1F / %x7F")
	if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
		throw new UnauthorizedException('Invalid authorization value.');
	}

	return {
		username: decoded.substring(0, index),
		password: decoded.substring(index + 1),
	};
}

class UnauthorizedException {
	constructor(message) {
		this.status = 401;
		this.statusText = 'Unauthorized';
		this.message = message;
	}
}

class BadRequestException {
	constructor(message) {
		this.status = 400;
		this.statusText = 'Bad Request';
		this.message = message;
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		try {
			console.log(`INFO Requesting IP: ${request.headers.get('CF-Connecting-IP')}`);
			return await handleRequest(request);
		} catch (err) {
			const message = err.message || err.stack || 'Unknown Error';

			// Log the detailed error internally
			console.error('ERROR', request.method, request.url, '=>', err);

			return new Response(message, {
				status: err.status || 500,
				statusText: err.statusText || null,
				headers: {
					'Content-Type': 'text/plain;charset=UTF-8',
					'Cache-Control': 'no-store',
					'Content-Length': message.length,
					'X-Content-Type-Options': 'nosniff',
					'X-Frame-Options': 'DENY',
					'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
				},
			});
		}
	},
} satisfies ExportedHandler<Env>;
