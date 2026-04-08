# Agent Lobby — Field Guide

Welcome, Agent.
This is your technical briefing for the company communications application.

## Application Overview

A real-time communication tool. It connects you to a shared lobby chat and lets you join/create other lobbies, as well as open private direct-message channels with other agents.

- Lobby chat runs over MQTT with presence, typing, and message state.
- Private direct messages use WebRTC to establish peer-to-peer connections for text, audio, video, and file transfer.

## How the Lobby connects

The lobby is not a peer-to-peer mesh. It is a hub-and-spoke model:

- Your app connects to an MQTT broker over secure WebSockets (`wss://`).
- The default broker is `wss://broker.emqx.io:8084/mqtt`.
- Lobby messages, presence updates, typing state, and DM signaling all flow through MQTT topics.
- This means lobby chat is encrypted in transit over TLS to the broker, but the broker can still see the message topics and payloads.

## 🕵️ Customize MQTT or Lobby topic

The Network Settings are hidden with a π sign on the Auth screen.

### What that means for you

- Lobby chat is fast and shared through a central relay.
- Your chosen handle is the only identity in the app — there is no login system.
- If you use a custom MQTT server, the security of lobby traffic depends on that broker.
- The app does not store your lobby traffic on disk unless you explicitly save it in the app.

## Private direct messages: the secure channel

Direct messages are where Agent Lobby goes peer-to-peer.

- DM signaling uses MQTT just to exchange the connection setup data.
- Once peers agree, the actual DM session is created with WebRTC.
- WebRTC encrypts audio, video, and files with DTLS/SRTP.

### WebRTC implications

- The app uses STUN servers to discover your public-facing network address.
- STUN helps peers connect across NAT and home routers.
- The current configuration uses Google's public STUN servers:
  - `stun:stun.l.google.com:19302`
  - `stun:stun1.l.google.com:19302`
  - `stun:stun2.l.google.com:19302`

### Important security notes

- If your network is behind a strict firewall or a VPN, direct DM connections may fail.
- The app does not currently use TURN relay servers, so if two agents cannot connect directly, the DM path may not establish.
- Because the connection is peer-to-peer, your device may reveal local or public IP address information during NAT traversal.
- Audio and video are encrypted end-to-end once the WebRTC session is established.

## What is and isn’t secure

- Lobby chat over MQTT is secure in transport if `wss://` is used, but it is not end-to-end encrypted by the app.
- Direct messages are encrypted by WebRTC after the peer connection is established.
- Your nickname is how other agents recognize you; but anyone can use it, do not assume anonymity.

## Bored Agent Entertainment

Included is agentAMP.  A simple mp3/mp4 player for entertainment while waiting for transmissions.
Also, linked youtube or twitch videos are embedded and can be pinned.  There is a "media sharing" option to add what you're listening/watching to your lobby presence.

## Put it on your MANET

If you have a MANET setup, or some other private network, you probably already have an MQTT broker.  Tie this into that and you have chat.  Add a STUN server and you can get DM's working.  Now you have text, audio, video, and file transfer available to your mobile area network for desktop clients.

## Final note

Agent Lobby is meant to feel like a covert signal station. The tech is modern and browser-based, but the security model depends on the network and the broker you use.

Stay sharp. Don't trust a handle. And remember: eyes are always watching.
