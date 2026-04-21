# Floorcraft

> Interactive office floor planner and seating management application

![Status](https://img.shields.io/badge/status-active%20development-blue)

Floorcraft is a browser-based tool for IT and workplace operations teams to design office layouts, manage employee seating assignments, and track space utilization — all in real time.

## Features

- **Canvas-based floor editor** — drag-and-drop room drawing, wall placement, and furniture arrangement powered by Konva/react-konva
- **Multi-floor support** — create and switch between floors within a project
- **Seating management** — assign employees to seats, view roster details, and manage headcount per space
- **Team and project workspaces** — team switcher, per-team projects, and role-based access
- **Share and collaborate** — share floor plans with configurable permissions
- **Undo/redo** — full temporal state history via Zundo
- **Export** — generate PDF exports of floor plans via jsPDF
- **Authentication** — email/password signup, login, password reset, and email verification via Supabase Auth
- **Insights dashboard** — space utilization reporting and analytics
- **Keyboard shortcuts** — power-user shortcuts overlay for common editor actions
- **Minimap** — bird's-eye navigation for large floor layouts

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Rendering | Konva / react-konva |
| State | Zustand 5 + Zundo (undo/redo) |
| Routing | React Router v7 |
| Backend / Auth | Supabase |
| UI Components | Radix UI primitives |
| Styling | Tailwind CSS v4 |
| Testing | Vitest + Testing Library |

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Run tests
npm test

# Production build
npm run build
```

The dev server starts at `http://localhost:5173` by default.

## Project Status

Actively developed. Current feature branches include `feat/accounts-and-team-offices`, `feat/curved-walls`, and others. The `main` branch is the stable baseline.