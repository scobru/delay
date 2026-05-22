# Delay

[![CI](https://github.com/scobru/delay/actions/workflows/ci.yml/badge.svg)](https://github.com/scobru/delay/actions/workflows/ci.yml)
[![npm](https://img.shields.io/badge/npm-v1.9.4-blue)](https://www.npmjs.com/package/delay)
[![License](https://img.shields.io/badge/license-MIT-yellow)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-127%20passing-brightgreen)]()
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/scobru/delay)

----

**Delay** is a production-ready connection hub that unifies **Zen**, **GunDB**, and **IPFS** into a single decentralized solution.

## Features

- **Zen-Native** — Deep integration with Zen's cryptographic primitives, DataBase wrapper, and identity resolution
- **GunDB Relay** — WebSocket relay with SQLite/RADISK persistence and WebRTC support
- **IPFS Integration** — Upload, pin, manage, and preview IPFS content via REST API
- **Admin Dashboard** — Modern React-based UI for monitoring and management
- **Network Federation** — Relay discovery, storage proofs, and reputation system

---

## Quick Start

### SDK Usage

To connect your application to a Delay hub, use the official SDK:

```bash
npm install @delay/sdk
```

See the [SDK Documentation](./sdk/README.md) for full usage examples, authentication, and IPFS operations.

### Docker Deployment

```bash
git clone <repository-url>
cd delay
./docker-start.sh

curl http://localhost:8765/health
```

### CapRover Deployment

When deploying via CapRover, you **must** configure the Container HTTP Port in the app settings to correctly route NGINX traffic.

1. Go to your CapRover Dashboard -> **Apps** -> **delay** -> **HTTP Settings**.
2. Set **Container HTTP Port** to `8765`.
3. Click **Save & Update**.

*(Failure to do this will result in `502 Bad Gateway` or `504 Gateway Timeout` errors).*

### Manual

```bash
cd delay/relay
npm install
npm run start:dev
```

Admin dashboards: `http://localhost:8765/`

---

## Configuration

Create a `.env` file with essential variables:

| Variable         | Description                | Default                 |
| ---------------- | -------------------------- | ----------------------- |
| `ADMIN_PASSWORD` | Admin token for all routes | _(required)_            |
| `IPFS_API_URL`   | IPFS API endpoint          | `http://127.0.0.1:5001` |
| `RELAY_PORT`     | HTTP port                  | `8765`                  |

See **[Environment Variables](./docs/ENVIRONMENT_VARIABLES.md)** for complete reference.

---

| Path         | Description                       |
| ------------ | --------------------------------- |
| `/dashboard` | New React Dashboard (Recommended) |
| `/admin`     | Legacy entry (redirects)          |
| `/endpoints` | API reference explorer            |

---

## Development

| **[API Reference](./docs/API.md)** | Complete REST API documentation |
| **[Environment Variables](./docs/ENVIRONMENT_VARIABLES.md)** | All configuration options |
| **[Node Operator Guide](./docs/NODE_OPERATOR_GUIDE.md)** | Run your own relay |
| **[Network Federation](./docs/NETWORK_FEDERATION.md)** | Relay discovery & reputation |
| **[Relay Keys](./docs/RELAY_KEYS.md)** | Keypair configuration |

---

## API Overview

### Core Endpoints

| Endpoint                   | Description               |
| -------------------------- | ------------------------- |
| `GET /gun`                 | WebSocket for Gun clients |
| `GET /health`              | Health check              |
| `GET /api/v1/system/stats` | System statistics         |

### IPFS

| Endpoint                             | Description                                              |
| ------------------------------------ | -------------------------------------------------------- |
| `POST /api/v1/ipfs/upload`           | Upload single file                                       |
| `POST /api/v1/ipfs/upload-directory` | Upload multiple files as directory (maintains structure) |
| `GET /api/v1/ipfs/cat/:cid`          | Stream content                                           |
| `POST /api/v1/ipfs/pin/add`          | Pin content                                              |
| `GET /api/v1/ipfs/pin/ls`            | List pins                                                |

### User Uploads & Metadata

| Endpoint                                              | Description                    |
| ----------------------------------------------------- | ------------------------------ |
| `GET /api/v1/user-uploads/system-hashes-map`          | Get complete file metadata map |
| `POST /api/v1/user-uploads/save-system-hash`          | Save file metadata (admin)     |
| `DELETE /api/v1/user-uploads/remove-system-hash/:cid` | Remove file metadata           |

Full API documentation at `/endpoints` or see **[API Reference](./docs/API.md)**.

---

## Project Structure

This monorepo consists of two primary components:

- **[`relay/`](./relay)**: The core server application (Zen, GunDB, IPFS connection hub).
- **[`sdk/`](./sdk)**: The TypeScript/JavaScript Client SDK (`@delay/sdk`) for building apps that connect to the relay.

```
delay/
├── relay/                 # Server Application
│   ├── src/               # Express + Gun bootstrap, REST endpoints, Admin UI
│   └── docs/              # API and Node operator documentation
├── sdk/                   # TypeScript/JavaScript SDK
│   ├── src/               # SDK source code
│   └── README.md          # SDK usage documentation
└── docker/                # Docker deployment utilities
```

---

## Troubleshooting

| IPFS UDP buffer warning     | Increase host `net.core.rmem_max` to 7500000 |
| Gun clients fail to connect | `wscat -c ws://localhost:8765/gun`            |
| IPFS API unauthorized       | Check `IPFS_API_TOKEN`                        |
| Admin UI "token required"   | Enter token at `/admin` first                 |

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests when relevant
4. Submit a pull request

---

## License

MIT License © Shogun contributors. See [LICENSE](LICENSE).
