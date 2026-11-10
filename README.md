# MYDROP

**Drop it. Share it. Get it.** MYDROP is a no-account, browser-based way to share files and text between two devices. A short-lived six-digit code introduces the devices; content then travels over an encrypted WebRTC data channel directly between their browsers.

## Features

- Server-issued, cryptographically generated six-digit codes with 15-minute expiry.
- Scannable QR links that prefill the code and connect the receiving device; camera scanning is also available on the receive form.
- A muted site-wide background video with a local SVG fallback; motion is disabled when reduced motion is preferred.
- Up to 20 files (100 MB each by default) and an optional 20,000-character message.
- Receiver approval before message or file bytes are sent.
- 64 KB file chunks, DataChannel backpressure, and byte-based progress.
- Socket.IO signaling, configurable STUN/TURN, CORS, Helmet headers, and API rate limits.
- Responsive layout and no account requirement.

## Requirements

Node.js 20 or newer and npm. Install dependencies in the project root:

```sh
npm install
npm install --prefix client
npm install --prefix server
```

Copy `server/.env.example` to `server/.env`; optionally copy `client/.env.example` to `client/.env.local`. Then run:

```sh
npm run dev
```

The Vite client is at `http://localhost:5173`; the API and Socket.IO server is at `http://localhost:4000`. Build with `npm run build`, run backend checks with `npm test`, and start the server with `npm start`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API and signaling port |
| `CLIENT_URL` | `http://localhost:5173,http://localhost:5174` | Comma-separated allowed browser origins |
| `NODE_ENV` | — | Set to `production` when deployed |
| `SESSION_TTL_SECONDS` | `900` | Sharing code lifetime |
| `MAX_FILE_BYTES` | `104857600` | Maximum accepted file size (100 MiB) |
| `STUN_URL` | Google public STUN | ICE discovery server |
| `TURN_URL` | — | Optional TURN URL |
| `TURN_USERNAME` | — | TURN username |
| `TURN_CREDENTIAL` | — | TURN credential; keep secret and set only on the server |
| `REDIS_URL` | — | Reserved for a future shared session-store adapter; currently unused |
| `VITE_API_URL` | `http://localhost:4000` | Client API origin |
| `VITE_SOCKET_URL` | API origin | Socket.IO origin |

The server includes configured TURN credentials in the authenticated sender/receiver signaling response. In production, use short-lived TURN credentials where your TURN provider supports them. HTTPS is required in production for secure contexts and WebRTC. Some restrictive networks will fail without TURN; MYDROP reports the connection failure and does not claim transfer success.

## Project structure

```text
client/                 React + Vite interface, WebRTC client and styles
server/src/app.js        Express API and input validation
server/src/server.js     HTTP, Socket.IO signaling and ICE configuration
server/src/session-store.js  Expiring in-memory session store
server/test/             API and session checks
```

## Transfer and privacy model

The Express server stores only a six-digit code, expiration, sender bearer token, and file metadata. It does not receive file bytes or message text. Socket.IO validates the sender's bearer token and lets the first receiver join; WebRTC negotiates a direct browser-to-browser DataChannel. DataChannel transport is encrypted by WebRTC. MYDROP does not provide an additional end-to-end encryption layer. The receiving browser downloads reassembled files locally. Filenames are displayed as text and never used as server paths.

Sessions live in process memory and disappear on server restart. Expired sessions are purged when the store is accessed. This is suitable for local development or one server process only; it is not suitable for multi-instance deployment or durable availability. `REDIS_URL` is documented as a deployment requirement to guide a future shared store but is not currently wired. Do not run multiple server instances behind a load balancer without implementing shared session storage and Socket.IO adapter support.

## API

- `GET /api/health` returns service health.
- `POST /api/transfers` accepts `{files:[{name,size,type}], text?}` and returns the backend-issued `code`, sender `ownerToken`, and expiry. Store the owner token only in the sender's browser memory.
- `GET /api/transfers/:code` validates an active code and returns expiry only.
- `DELETE /api/transfers/:code` cancels only when sent with `Authorization: Bearer <ownerToken>`.
- Socket.IO events `sender:join`, `receiver:join`, `signal:offer`, `signal:answer`, `signal:ice`, and transfer decision events connect the two browsers. The receiver accepts before payload transmission.

Lookup is limited to 20 requests per IP per minute and creation to 10 per minute. These in-process limits and session storage are not distributed. Deploy behind HTTPS, configure a strict `CLIENT_URL`, use an appropriate shared rate-limit store and session/signaling adapter before scaling. The six-digit code is an introduction mechanism, not a secret with high entropy; its short lifetime, lookup limits, one-receiver rule and sender authorization reduce exposure.

## Deployment

Build the client (`npm run build`) and serve `client/dist` from an HTTPS-capable static host. Configure the host to return `index.html` for the client routes (`/send`, `/receive`, `/how-it-works`, `/about`) so direct links and refreshes continue to work. Deploy the Node server on a platform supporting persistent WebSocket connections; configure `CLIENT_URL`, `PORT`, `SESSION_TTL_SECONDS`, `MAX_FILE_BYTES`, and ICE settings. Set `VITE_API_URL` and `VITE_SOCKET_URL` to the public HTTPS/WSS backend before building. Configure TURN for real-world connectivity. MYDROP has not been deployed or verified on a hosting provider.

## Known limitations

- Session and rate-limit state is in-memory and single-instance only.
- Without TURN, some NATs, firewalls, and corporate networks cannot establish peer-to-peer connections.
- Refreshing either page loses its in-memory peer/session credentials.
- Browser memory is used to reassemble a received file before download; very large transfers are limited to 100 MiB each.
- Automated checks cover API/session behavior. A two-browser WebRTC transfer requires live browser/network testing and has not been run in this environment.
