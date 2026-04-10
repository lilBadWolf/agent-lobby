# OPERATORS

This document explains the server and service requirements for running Agent Lobby on a private network or MANET. It is intentionally self-contained: there is no special backend service required beyond the standard MQTT broker and STUN infrastructure described here.

## 1. Architecture overview

Agent Lobby uses two distinct transport layers:

- **MQTT over secure WebSockets** for lobby chat, presence, typing, and DM signaling.
- **WebRTC (ICE/STUN)** for direct peer-to-peer private message sessions, audio, video, and file transfer.

There is no dedicated application server, database, or signaling service built into the app. All server-side behavior is provided by standard MQTT and STUN services.

## 2. Required services

### 2.1 MQTT broker

Agent Lobby depends on a single MQTT broker for all non-peer media traffic.

What it carries:

- lobby chat messages
- lobby presence state
- lobby typing state
- DM signaling payloads (offer/answer/ICE, DM request/accept/reject, call control, file-transfer offers)

Why MQTT:

- It provides a stable hub for users to join the same lobby and see each other online.
- It is the only centralized relay the app needs.

#### Broker transport requirements

- Must support **WebSocket transport**.
- Must support **secure WebSockets**: `wss://`.
- Must be reachable by all clients in your MANET.
- Plain TCP MQTT (`mqtt://`) is not used by the app.

#### Default broker

The app defaults to:

- `wss://broker.emqx.io:8084/mqtt`

This is only a convenience default. For operational security and MANET deployment, host your own broker.

#### Example topics used by the app

Lobby topics:

- `{{lobbyId}}_lobby/chat_global`
- `{{lobbyId}}_lobby/presence/{{USERNAME}}`

DM signaling topics:

- `agent_lobby/dm_signal/{{sender}}/{{receiver}}`
- `agent_lobby/dm_signal/+/{{receiver}}`

The broker does not need any custom logic to support these topics. It only needs to route subscribe/publish requests.

#### Recommended broker software

Any MQTT broker with secure websocket support is compatible, for example:

- EMQX
- Mosquitto (with `websockets` enabled)
- HiveMQ
- RabbitMQ MQTT plugin

#### Minimal Mosquitto WebSocket config

```conf
listener 8084
protocol websockets
cafile /path/to/ca.pem
certfile /path/to/server.crt
keyfile /path/to/server.key

# Optional: require authentication or ACLs if you want to lock down lobby topics
# allow_anonymous false
# password_file /etc/mosquitto/passwd
```

Then use a client URL like:

- `wss://<broker-host>:8084/mqtt`

> Note: In the app, the MQTT server URL is editable through the hidden network settings on the auth screen.

#### Security implications

- Lobby traffic and DM signaling are encrypted on the wire by TLS when using `wss://`.
- The broker can still inspect topic names and payloads.
- The app does not perform end-to-end encryption for lobby chat.
- DM media and file traffic are encrypted end-to-end by WebRTC after the peer connection is established.

### 2.2 STUN servers

Direct messages use WebRTC ICE. The app uses STUN to discover public network addresses and negotiate connectivity.

The current hardcoded STUN list is:

- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`
- `stun:stun2.l.google.com:19302`

If you are operating inside a private network, you should deploy your own STUN server or use an internal addressable STUN service.

#### Why STUN is needed

- STUN helps WebRTC peers discover their external endpoint when NAT is present.
- It is required for ICE candidate exchange in most real-world NAT/router environments.
- It does not relay media traffic; it only assists with address discovery.

#### TURN relay support

Agent Lobby currently does not use TURN servers.

- If the two peers cannot establish a direct path using STUN and ICE, private DMs, audio, video, and file transfer will fail.
- For hard firewalls/NAT environments, this is the main limitation.

### 2.3 Optional: STUN on MANET

If your MANET is fully private and all desktop clients are on the same flat layer-2 network, a STUN server may not be strictly required. However:

- A STUN server is still useful when clients are behind separate NAT boundaries.
- If the MANET bridges to the public internet, provide a STUN server reachable by all clients.

## 3. What you need to run on your MANET

At minimum, deploy:

1. **MQTT broker** with `wss://` support.
2. **STUN server** reachable by all clients.

That is it. The app will use:

- MQTT for lobby and signaling
- WebRTC for peer sessions

No additional application server is required.

## 4. How to configure the app

The app exposes network configuration in the auth flow. Operators should know these values:

- `mqttServer` — the broker WebSocket URL
- `defaultLobby` — the lobby room ID to join by default

Example configuration for a private deployment:

- `mqttServer`: `wss://mqtt.manet.local:8084/mqtt`
- `defaultLobby`: `spy_terminal`

### Network config visibility

The settings are hidden behind the π icon in the auth screen. Once set, the app persists them locally.

## 5. Traffic breakdown

### Lobby chat

- Type: MQTT publish/subscribe
- Security: TLS over WebSockets if using `wss://`
- Message flow: client → broker → subscribed clients
- Data persistence: none beyond MQTT retains if configured by broker

### Presence and typing

- Type: MQTT retained/non-retained state messages
- Each user publishes presence to a topic under the lobby.
- The broker acts as the source of truth for who is currently online.

### DM signaling

- Type: MQTT publish/subscribe on `agent_lobby/dm_signal/*`
- Carries WebRTC signaling data only
- After signaling completes, actual private communication leaves MQTT and runs directly between peers

### DM media and files

- Type: WebRTC peer-to-peer
- Transport: UDP/DataChannel/RTCP depending on browser/OS
- Encryption: DTLS/SRTP
- Relay: none by default

## 6. Deployment notes for operators

- Use a broker certificate trusted by client devices when possible.
- Open any required TCP/UDP ports for the broker and STUN service.
- Do not rely on public brokers for sensitive deployments.
- If you want to preserve privacy, run both services inside the MANET.
- Because there is no app-level identity, usernames are untrusted and can be impersonated. (this is by design)

## 7. Troubleshooting

### Lobby connection fails

- Verify the `mqttServer` URL is reachable from the client.
- Confirm the broker accepts secure WebSocket connections.
- Confirm the broker allows publish/subscribe to the expected topic patterns.

### DM sessions fail

- Verify the STUN server is reachable.
- Verify network routing between peers supports UDP hole punching.
- If peers are behind symmetric NAT or a strict firewall, direct DM may not be possible.

## 8. Summary

Agent Lobby is intentionally lightweight on server requirements:

- **One MQTT broker with WSS** for chat + signaling
- **One STUN service** for WebRTC ICE

This is the complete server surface for the app. If your MANET will provide these two services, Agent Lobby can run without any additional backend.
