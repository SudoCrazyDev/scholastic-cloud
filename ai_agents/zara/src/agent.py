import logging

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession, RoomInputOptions, inference
from livekit.plugins import noise_cancellation, silero

logger = logging.getLogger("zara")

load_dotenv(".env.local")
load_dotenv()


class ZaraAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Zara, a helpful and friendly voice assistant. "
                "Keep your responses concise and conversational, since they "
                "will be spoken aloud. Avoid markdown, lists, and emoji."
            )
        )


async def entrypoint(ctx: agents.JobContext):
    # STT/LLM/TTS are served by LiveKit Inference — no provider API keys needed,
    # only LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET.
    session = AgentSession(
        stt="deepgram/nova-3",
        llm="openai/gpt-4.1-mini",
        tts=inference.TTS("cartesia/sonic-3", voice="ec1e269e-9ca0-402f-8a18-58e0e022355a"),
        vad=silero.VAD.load(),
        turn_detection=inference.TurnDetector(),
    )

    await session.start(
        room=ctx.room,
        agent=ZaraAgent(),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    await session.generate_reply(
        instructions="Greet the user warmly and ask how you can help."
    )


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
