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
				const { username, password } = basicAuthentication(request);

				// Throws exception when query parameters aren't formatted correctly
				const url = new URL(request.url);
				verifyParameters(url);

				// Only returns this response when no exception is thrown.
				const response = await informAPI(url, username, password);
				return response;
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
async function informAPI(url, name, token) {
	try {
		// Parse Url
		const hostname = url.searchParams.get('hostname');
		// Get the IP address. This can accept two query parameters, this will
		// use the "ip" query parameter if it is set, otherwise falling back to "myip".
		const ip = url.searchParams.get('ip') || url.searchParams.get('myip');

		// Initialize API Handler
		const cloudflare = new Cloudflare({
			token: token,
		});

		// Verify token
		const isTokenValid = await cloudflare.verifyToken();
		if (!isTokenValid) {
			throw new UnauthorizedException('Invalid token.');
		}

		const zone = await cloudflare.findZone(name);
		const record = await cloudflare.findRecord(zone, hostname);
		const result = await cloudflare.updateRecord(record, ip);

		// Only returns this response when no exception is thrown.
		console.log(`INFO Successfully updated record.`);
		return new Response(`good`, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain;charset=UTF-8',
				'Cache-Control': 'no-store',
			},
		});
	} catch (err) {
		// Log the detailed error internally
		console.error(`ERROR Worked failed to update record: ${JSON.stringify(err)}`);

		const message = err.reason || err.message || 'Unknown Error';
		return new Response(message, {
			status: err.status || 500,
			statusText: err.statusText || 'Internal Server Error',
			headers: {
				'Content-Type': 'text/plain;charset=UTF-8',
				'Cache-Control': 'no-store',
			},
		});
	}
}

/**
 * Throws exception on verification failure.
 * @param {string} url
 * @throws {UnauthorizedException}
 */
function verifyParameters(url) {
	if (!url.searchParams) {
		throw new BadRequestException('You must include proper query parameters');
	}

	if (!url.searchParams.get('hostname')) {
		throw new BadRequestException('You must specify a hostname');
	}

	if (!(url.searchParams.get('ip') || url.searchParams.get('myip'))) {
		throw new BadRequestException('You must specify an ip address');
	}
}

/**
 * Parse HTTP Basic Authorization value.
 * @param {Request} request
 * @throws {BadRequestException}
 * @returns {{ user: string, pass: string }}
 */
function basicAuthentication(request) {
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
	constructor(reason) {
		this.status = 401;
		this.statusText = 'Unauthorized';
		this.reason = reason;
	}
}

class BadRequestException {
	constructor(reason) {
		this.status = 400;
		this.statusText = 'Bad Request';
		this.reason = reason;
	}
}

class CloudflareApiException extends Error {
	constructor(reason) {
		super(reason);
		this.status = 500;
		this.statusText = "Internal Server Error";
	}
}

class Cloudflare {
	constructor(options) {
		this.cloudflare_url = 'https://api.cloudflare.com/client/v4';

		if (options.token) {
			this.token = options.token;
		}

		this.verifyToken = async () => {
			const response = await fetch(`${this.cloudflare_url}/user/tokens/verify`, {
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.token}`,
				},
			});
			const body = await response.json();
			if (body.success === false) {
				return false;
			}
			if (body.errors?.length > 0) {
				return false;
			}
			return body.result.status === 'active';
		};

		this.findZone = async (name) => {
			const response = await fetch(`${this.cloudflare_url}/zones?name=${name}`, {
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.token}`,
				},
			});
			const body = await response.json();
			if (!body.success || body.result.length === 0) {
				throw new CloudflareApiException(`Failed to find zone '${name}'`);
			}
			return body.result[0];
		};

		this.findRecord = async (zone, name) => {
			const response = await fetch(`${this.cloudflare_url}/zones/${zone.id}/dns_records?name=${name}`, {
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.token}`,
				},
			});
			const body = await response.json();
			if (!body.success || body.result.length === 0) {
				throw new CloudflareApiException(`Failed to find dns record '${name}'`);
			}
			return body.result[0];
		};

		this.updateRecord = async (record, value) => {
			record.content = value;
			const response = await fetch(`${this.cloudflare_url}/zones/${record.zone_id}/dns_records/${record.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.token}`,
				},
				body: JSON.stringify(record),
			});
			const body = await response.json();
			if (!body.success) {
				throw new CloudflareApiException("Failed to update dns record");
			}
			return body.result[0];
		};
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		try {
			return await handleRequest(request);
		} catch (err) {
			const message = err.reason || err.stack || 'Unknown Error';

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
