import { Cloudflare, ClientOptions } from 'cloudflare';

class UnauthorizedException extends Error {
	status: number;
	statusText: string;
	constructor(message: string) {
		super(message);
		this.status = 401;
		this.statusText = 'Unauthorized';
	}
}

class BadRequestException extends Error {
	status: number;
	statusText: string;
	constructor(message: string) {
		super(message);
		this.status = 400;
		this.statusText = 'Bad Request';
	}
}

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
		case '/update': {
			const { username, password } = parseBasicAuthentication(request);
			const cloudflareClientOptions = { apiEmail: username, apiToken: password };

			// Throws exception when query parameters aren't formatted correctly
			const url = new URL(request.url);
			const updateRecordRequest = parseSearchParams(url);

			return await updateDNSRecord(updateRecordRequest, cloudflareClientOptions);
		}

		case '/favicon.ico':
		case '/robots.txt':
			return new Response(null, { status: 204 });
	}

	return new Response('Not Found.', { status: 404 });
}

/**
 * Updates a DNS record with the given IP address.
 * @param {String} hostname
 * @param {String} ip
 * @param {String} zoneName
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

	return new Response(`good`, {
		status: 200,
		headers: {
			'Content-Type': 'text/plain;charset=UTF-8',
			'Cache-Control': 'no-store',
		},
	});
}

/**
 * Parse search parameters from URL.
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
 * Parse basic authentication from request headers.
 * @param {Request} request
 * @throws {UnauthorizedException}
 * @returns {{ username: string, password: string }}
 */
function parseBasicAuthentication(request) {
	const Authorization = request.headers.get('Authorization');
	if (!Authorization) {
		throw new UnauthorizedException('Please provide valid credentials.');
	}

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

export default {
	async fetch(request, env, ctx): Promise<Response> {
		try {
			console.log(`INFO Requesting IP: ${request.headers.get('CF-Connecting-IP')}`);
			return await handleRequest(request);
		} catch (err) {
			console.error('ERROR', request.method, request.url, '=>', err);
			if (err instanceof UnauthorizedException || err instanceof BadRequestException) {
				return new Response(err.message, {
					status: err.status,
					statusText: err.statusText,
					headers: {
						'Content-Length': `${err.message.length}`,
						...defaultHttpHeaders,
					},
				});
			} else {
				return new Response('Unknown Error', {
					status: 500,
					statusText: 'Internal Server Error',
					headers: defaultHttpHeaders,
				});
			}
		}
	},
} satisfies ExportedHandler<Env>;

const defaultHttpHeaders = {
	'Content-Type': 'text/plain;charset=UTF-8',
	'Cache-Control': 'no-store',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};
