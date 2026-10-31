# Afterhour

A web typography tool: bring a font, type text, and (later) let night-rain droplets land on it. Static site for GitHub Pages; fonts never leave the browser.

## Prerequisites

- Node.js 22 LTS or newer (see `.nvmrc`)
- npm

## Commands

| Task              | Command                                          |
| ----------------- | ------------------------------------------------ |
| Install           | `npm ci` (or `npm install` the first time)       |
| Dev server        | `npm run dev` → http://localhost:5173/Afterhour/ |
| Production build  | `npm run build`                                  |
| Preview the build | `npm run preview`                                |
| Lint              | `npm run lint`                                   |
| Format            | `npm run format`                                 |

The production build is written to **`dist/`**. Assets use the base path `/Afterhour/` (set in `vite.config.ts`) so they resolve on GitHub Pages.

## Stack

Vite + vanilla TypeScript, Canvas 2D / DOM, no UI framework (see Jira H4N-19).
