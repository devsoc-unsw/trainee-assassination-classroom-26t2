# Drawmeleon

Drawmeleon is a real time multiplayer drawing and imposter party game. Games run through multiple rounds with a two pass structure per round, enforcing a blind first, informed second drawing mechanic that drives the core gameplay tension. Built with lightweight session based authentication and real time socket communication for live multiplayer play.

Built with DevSoc UNSW, 26T2. Demoed live at a showcase with 8 concurrent players and won the Best Pitch Award! 🏆

## How to play? 
- Create/join a room!
- Each round, every player gets the same secret word, except the imposter (who only gets a hint instead...)
- Each round has two passes, and every player gets one turn per pass, so two turns total per round
- Each turn is just one stroke, so draw wisely :)
- After both passes, players vote on who they think the imposter is!
- The imposter wins by blending in and avoiding detection, everyone else wins by spotting the imposter
- However, if the imposter gets voted out, they get one last shot at redemption: guess the secret word. Guess right? They still win! Guess wrong? And they're out for good.

## Tech stack
 
Two processes run side by side in dev (`npm run dev` uses `concurrently`): the Next.js app and a standalone Socket.IO server.
 
**Frontend**
- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4
- Client components for all game screens, with dedicated routes per phase (drawing, voting, reveal, final guess)

**Realtime layer**
- Socket.IO for client/server communication
- Shared, typed event and payload definitions between client and server
- Clock sync to keep phase countdowns accurate across clients
  
**Server side game logic**
- Server authoritative state machine, in memory only, no database
- Per client state serialisation so private data (word, imposter, votes) is never leaked
- Timed phase transitions (drawing, voting, reveal, scoring) with reconnect grace on disconnect
  
**Tools**
- Vitest for tests
- ESLint

## Getting started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Team

- Project lead / senior reviewer: Jen
- Co-lead: Siya Yuan
- Trainee developers: Alex Varughese, Henrikus Maja Ericsson Sipahutar

## Learn more

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial

## Deploy on Vercel

The easiest way to deploy this app is to use the [Vercel Platform](https://vercel.com/new) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
