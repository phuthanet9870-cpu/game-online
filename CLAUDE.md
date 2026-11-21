# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The repository contains only `README.md` (`# game-online`). There is no source code, package manifest, build, lint, or test configuration, CI, or agent config (Cursor, Copilot, Codex, Gemini). There are therefore no build, lint, or test commands yet. Do not assume any. When tooling is added, document the real commands here, including how to run a single test.

## Project direction

- The goal is a project that can host many kinds of games, not one game. Build the shared infrastructure once, and make each game type a self-contained module on top of it, so adding a game does not require changing the others.
- The first game to build is a multiplayer game hosted on the web: one player hosts a room and others join from a browser.
- The user writes in Thai. Reply to them in Thai.

## Open decisions

These are not decided yet. Ask before choosing one that shapes the architecture:

- Language and runtime for the server and the browser client.
- Multiplayer transport, for example a WebSocket server that relays messages, or WebRTC peer-to-peer.
- How individual games plug into the shared core (for example a registry of game modules).

## Git

- Develop on branch `claude/gifted-galileo-1lo17b` and push there.
- Do not open a pull request unless the user asks.
