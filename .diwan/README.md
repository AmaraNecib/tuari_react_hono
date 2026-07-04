# Model Registry — .diwan

The `.diwan/` directory is a **portable model registry** that the architect
(parent agent) reads to choose the right model for each subagent task.

The registry lists available models, their providers, capabilities, and
priority. The architect selects the highest-priority model matching the
required role.

## File Structure

```
.diwan/
├── models.yml    # Model registry (portable, committed)
└── README.md     # This file
```

## How the architect uses it

1. Read `.diwan/models.yml` to list available models
2. Filter by `roles` matching the task (e.g., `review`, `testing`, `code`)
3. Select the highest-`priority` model from the filtered list
4. Pass the model ID to the subagent call

If a specific model is requested (e.g., "use mimo-2.5"), the architect
honours that over the registry.

## Adding models

Models are defined per provider. Each model has:
- `id` — the full model ID (e.g., `opencode-go/deepseek-v4-flash`)
- `priority` — lower = preferred (1 is highest)
- `roles` — list of roles this model can handle

## Provider Authentication

Provider API keys live in `~/.pi/agent/auth.json`, not in this directory.
