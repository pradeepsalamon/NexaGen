# BlueRoom

Minimal Google Meet style MVP built with Next.js App Router, TypeScript, Tailwind CSS, and LiveKit.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS v4
- LiveKit
- shadcn-style UI components
- lucide-react icons

## Features

- Landing page with room and username inputs
- Random room generator
- Input validation
- Meeting page at `/meet/[roomId]`
- Auto join via LiveKit token route
- Participant video tiles and names
- Mic, camera, screen-share, and leave controls
- Connection status
- Dark mode

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

```env
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
NEXT_PUBLIC_LIVEKIT_URL=
```

## Install

```bash
pnpm install
```

## Run

```bash
pnpm dev
```

Open `http://localhost:3000`.

## How it works

1. Go to `/`
2. Enter a room name and display name
3. Join the meeting
4. The client calls `POST /api/livekit/token`
5. The API creates a LiveKit access token with room join, publish, and subscribe permissions
6. Anyone joining the same room URL can communicate together
