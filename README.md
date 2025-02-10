
# Cloudflare Worker Dynamic DNS

This project provides a Cloudflare Worker solution for managing dynamic DNS updates, described by my [Tame Your Dynamic IP: A Cloudflare Worker Solution for Unifi](https://blog.tdharris.com/tame-your-dynamic-ip-a-cloudflare-worker-solution-for-unifi) article.

## Overview

The Cloudflare Worker handles HTTP requests to update DNS records dynamically. It verifies the request, authenticates using basic authentication, and updates the DNS record with the provided IP address.

## Features

- Secure HTTPS connection requirement.
- Basic authentication for request verification.
- DNS record update using Cloudflare API.
- Error handling for various scenarios.

## Setup

### Prerequisites

- Cloudflare account.
- Cloudflare API token with permissions to read and edit DNS records and read Zones.
	**Note**: For more details, see the [Create a Cloudflare API Token](https://blog.tdharris.com/tame-your-dynamic-ip-a-cloudflare-worker-solution-for-unifi#create-a-cloudflare-api-token) section from my article.

### Installation

1. Clone the repository:

    ```sh
    git clone https://github.com/yourusername/cloudflare-worker-dyndns.git
    cd cloudflare-worker-dyndns
    ```

2. Install dependencies:

    ```sh
    npm install
    ```

3. Configure environment variables:

    Create a `.env` file in the root directory with the following content:

    ```env
    CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
    ```

### Deployment

1. Deploy the Cloudflare Worker:

    ```sh
    npm run deploy
    ```

## Usage

### Update DNS Record

To update a DNS record, send any HTTP request to the worker URL with the following details:

**Query parameters**:

- `hostname`: The DNS record to update.
- `ip`: The new IP address.
- `zone`: The Cloudflare zone name.

**Authorization header**:

- `username`: The Cloudflare API email address.
- `password`: The Cloudflare API token.

Example request:

```sh
curl -X GET "https://your-worker-url/update?hostname=dns.example.com&ip=1.2.3.4&zone=example.com" \
     -H "Authorization: Basic $(echo -n 'username:password' | base64)"
```

#### Configuration with Unifi

To configure the Unifi controller to update the DNS record automatically, see the [Configure Unifi Dynamic DNS](https://blog.tdharris.com/tame-your-dynamic-ip-a-cloudflare-worker-solution-for-unifi#configure-unifi-dynamic-dns) section from my article.

### Error Handling

The worker handles various error scenarios and returns appropriate HTTP status codes and messages:

- `400 Bad Request`: Missing or invalid query parameters.
- `401 Unauthorized`: Invalid or missing authorization.
- `404 Not Found`: Unknown paths.
- `500 Internal Server Error`: Unknown errors.

## Testing

To run the tests, use the following command:

```sh
npm test
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
