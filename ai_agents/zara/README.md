# Zara — LiveKit Voice Agent

A voice AI agent built with [LiveKit Agents](https://docs.livekit.io/agents/) (Python).

Pipeline: Deepgram Nova-3 (STT) → GPT-4.1-mini (LLM) → Cartesia Sonic-3 (TTS),
all served by [LiveKit Inference](https://docs.livekit.io/agents/models/) —
billed through your LiveKit Cloud account, no separate provider API keys.
Plus Silero VAD, LiveKit's hosted turn detector, and BVC noise cancellation.

## Setup

Dependencies are managed with [uv](https://docs.astral.sh/uv/):

```sh
uv sync
```

Copy the env template and fill in your keys:

```sh
copy .env.example .env.local
```

Download model weights (Silero VAD) before first run:

```sh
uv run python src/agent.py download-files
```

## Run

Talk to the agent directly in your terminal (no LiveKit room needed):

```sh
uv run python src/agent.py console
```

Run in development mode (connects to your LiveKit server, hot-reloads):

```sh
uv run python src/agent.py dev
```

Run in production mode:

```sh
uv run python src/agent.py start
```

With `dev`/`start`, connect from any client — use the bundled dashboard below,
or the [LiveKit Agents Playground](https://agents-playground.livekit.io/).

## Dashboard

A React + Vite web client lives in [`dashboard/`](dashboard/). It shows Zara's
state (listening / thinking / speaking) with an audio visualizer, and has mic
controls. Its dev server mints LiveKit access tokens from the same
`.env.local`, so no extra config is needed.

```sh
cd dashboard
npm install
npm run dev
```

Then, with the agent running (`uv run python src/agent.py dev`), open
http://localhost:5173 and click **Talk to Zara**.
