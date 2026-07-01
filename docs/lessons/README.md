# Agent Lessons

This directory contains **permanent lessons** — validated learnings that survive
across sessions and projects. These are referenced by `agent.md` for agents
to read at the start of each session.

## Structure

```
.agents/lessons/
├── README.md              # This file — explains the system
└── <topic>-<date>.md      # One lesson per topic file
```

## How to use

1. At the start of a new session, read all `.md` files in this directory
2. Apply the lessons to avoid repeating past mistakes
3. When a new lesson is validated across multiple sessions, add a file here
4. Keep files focused — one topic per file

## When to add a lesson here

Add to `.agents/lessons/` when:
- The same issue happened 2+ times across different sessions
- The lesson is about a permanent tool/API behavior (not a one-time mistake)
- The lesson applies across multiple projects

One-time session notes go to `.scratch/sessions/` instead.

## Referencing from agent.md

In `agent.md`, add:
```
Always read .agents/lessons/ before starting any work.
```
