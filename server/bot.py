import os
import asyncio
from dotenv import load_dotenv
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService, InputParams
from pipecat.transports.daily.transport import DailyTransport, DailyParams
from pipecat.processors.aggregators.llm_response import LLMResponseAggregator

load_dotenv()


async def main(room_url: str, token: str):
    transport = DailyTransport(
        room_url,
        token,
        "Medical_Brain",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            video_in_enabled=True,
            camera_out_enabled=False,
        ),
    )

    llm = GeminiLiveLLMService(
        api_key=os.getenv("GOOGLE_API_KEY"),
        model="gemini-2.5-flash-native-audio-preview-12-2025",
        voice_id="Charon",
        system_instruction="You are a helpful medical diagnostic assistant. Listen to the user's symptoms and observations. If you need to analyze their screen, ask them to share it.",
    )

    pipeline = Pipeline([transport.input(), llm, transport.output()])

    task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=True))
    runner = PipelineRunner()

    await runner.run(task)


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        print("Usage: python bot.py <room_url> <token>")
        sys.exit(1)

    ROOM_URL = sys.argv[1]
    TOKEN = sys.argv[2]
    asyncio.run(main(ROOM_URL, TOKEN))
