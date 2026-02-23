import os
import asyncio
import subprocess
import aiohttp
import time
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DAILY_API_KEY = os.getenv("DAILY_API_KEY")
DAILY_API_URL = "https://api.daily.co/v1"


class RoomResponse(BaseModel):
    url: str
    token: str


async def create_daily_room():
    """Create a Daily.co room and return URL + token"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DAILY_API_KEY}",
    }

    exp_time = int(time.time()) + 3600  # 1 hour expiry

    room_config = {
        "properties": {
            "enable_screenshare": True,
            "enable_chat": False,
            "enable_knocking": False,
            "start_video_off": True,
            "start_audio_off": False,
        }
    }

    async with aiohttp.ClientSession() as session:
        # Create room
        async with session.post(
            f"{DAILY_API_URL}/rooms", headers=headers, json=room_config
        ) as resp:
            if resp.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to create room: {await resp.text()}",
                )
            room = await resp.json()

        # Create token
        token_config = {
            "properties": {
                "room_name": room["name"],
                "exp": exp_time,
                "is_owner": True,
            }
        }

        async with session.post(
            f"{DAILY_API_URL}/meeting-tokens", headers=headers, json=token_config
        ) as resp:
            if resp.status != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to create token: {await resp.text()}",
                )
            token_data = await resp.json()

        return {"url": room["url"], "token": token_data["token"]}


@app.get("/")
async def root():
    return {"status": "ok", "message": "Medical Brain API is running"}


@app.post("/create-room", response_model=RoomResponse)
async def create_room():
    """Create a new Daily room for a session"""
    try:
        room_data = await create_daily_room()
        return RoomResponse(**room_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/start-bot")
async def start_bot(request: Request):
    """Start the Pipecat bot in the specified room"""
    try:
        body = await request.json()
        room_url = body.get("room_url")
        token = body.get("token")

        if not room_url or not token:
            raise HTTPException(status_code=400, detail="Missing room_url or token")

        # Get the venv python path
        import sys

        venv_python = sys.executable

        # Start the bot as a subprocess
        process = subprocess.Popen(
            [venv_python, "bot.py", room_url, token],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            env={**os.environ},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return {"status": "started", "pid": process.pid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
