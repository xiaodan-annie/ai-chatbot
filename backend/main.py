from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

from sqlalchemy.orm import Session

import os

from database import SessionLocal, engine
from models import Base, ChatMessage, Conversation  # ✅ FIXED IMPORT

# =====================
# APP INIT (ONLY ONCE)
# =====================
app = FastAPI()

# =====================
# CORS (ONLY ONCE)
# =====================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ai-chatbot-ye.netlify.app",
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add codes below
#import os
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)
#print("OPENAI_API_KEY =", os.getenv("OPENAI_API_KEY"))

Base.metadata.create_all(bind=engine)
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

# =====================
# REQUEST MODEL
# =====================
class ChatRequest(BaseModel):
    message: str
    language: str
    session_id: str
    conversation_id: int

# =====================
# CHAT ENDPOINT
# =====================
@app.post("/chat")
async def chat(req: ChatRequest):

    db: Session = SessionLocal()

    # Save user message
    user_message = ChatMessage(
        conversation_id=req.conversation_id,
        role="user",
        content=req.message
    )

    db.add(user_message)
    db.commit()

    # Load conversation
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == req.conversation_id)
        .first()
    )

    # Auto title
    if conversation and conversation.title == "New Chat":
        conversation.title = req.message[:30]
        db.commit()

    # Load history
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == req.conversation_id)
        .all()
    )

    if req.language == "Auto":
        system_prompt = """
        Reply in same language as user.
        """
    else:
        system_prompt = f"""
        ALWAYS respond in {req.language}.
        """

    messages = [
        {
            "role": "system",
            "content": system_prompt
        }
    ]

    for msg in history:
        messages.append({
            "role": msg.role,
            "content": msg.content
        })

    def generate():

        stream = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            stream=True
        )

        full_reply = ""

        for chunk in stream:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_reply += content
                yield content

        assistant_message = ChatMessage(
            conversation_id=req.conversation_id,
            role="assistant",
            content=full_reply
        )

        db.add(assistant_message)
        db.commit()
        db.close()

    return StreamingResponse(
        generate(),
        media_type="text/plain"
    )

# =====================
# NEW CHAT ENDPOINT
# =====================
@app.post("/new-chat")
async def new_chat(session_id: str):

    db: Session = SessionLocal()

    conversation = Conversation(
        session_id=session_id,
        title="New Chat"
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    db.close()

    return {
        "conversation_id": conversation.id
    }

@app.get("/conversations/{session_id}")
async def get_conversations(session_id: str):

    db: Session = SessionLocal()

    conversations = (
        db.query(Conversation)
        .filter(
            Conversation.session_id == session_id
        )
        .order_by(
            Conversation.created_at.desc()
        )
        .all()
    )

    results = []

    for convo in conversations:

        results.append({
            "id": convo.id,
            "title": convo.title,
            "created_at":
                convo.created_at.strftime(
                    "%Y-%m-%d %H:%M"
                )
        })

    db.close()

    return results

@app.get("/messages/{conversation_id}")
async def get_messages(conversation_id: int):

    db: Session = SessionLocal()

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation_id)
        .all()
    )

    db.close()

    return [
        {
            "role": msg.role,
            "content": msg.content
        }
        for msg in messages
    ]

@app.delete("/conversation/{conversation_id}")
async def delete_conversation(conversation_id: int):

    db: Session = SessionLocal()

    # Delete messages first
    db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation_id
    ).delete()

    # Delete conversation
    db.query(Conversation).filter(
        Conversation.id == conversation_id
    ).delete()

    db.commit()

    db.close()

    return {
        "message": "Conversation deleted"
    }