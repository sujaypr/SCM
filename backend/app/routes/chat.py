from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Header, Depends, Body
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
import json
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.services.enhanced_rag_service import EnhancedRAGService
from app.utils.document_processor import DocumentProcessor
from app.models.db_models import ChatSession, ChatMessage, DocumentStore, Business, DemandForecast
from app.utils.db import get_engine, get_db
from sqlalchemy import create_engine, select, desc

router = APIRouter()
rag_service = EnhancedRAGService()
doc_processor = DocumentProcessor()


class ChatResponse(BaseModel):
    success: bool
    response: str
    session_id: Optional[str] = None
    sources: Optional[List[Dict[str, Any]]] = None
    confidence: Optional[float] = None
    error: Optional[str] = None


class SessionListResponse(BaseModel):
    success: bool
    sessions: List[Dict[str, Any]]


class MessageListResponse(BaseModel):
    success: bool
    messages: List[Dict[str, Any]]


@router.get("/sessions", response_model=SessionListResponse)
async def get_chat_sessions(db: Session = Depends(get_db)):
    """Get all chat sessions"""
    try:
        sessions = (
            db.query(ChatSession)
            .filter(ChatSession.is_active == True)
            .order_by(ChatSession.updated_at.desc())
            .all()
        )
        
        result = []
        for s in sessions:
            # Get last message time
            last_msg = (
                db.query(ChatMessage)
                .filter(ChatMessage.session_id == s.id)
                .order_by(ChatMessage.created_at.desc())
                .first()
            )
            
            msg_count = db.query(ChatMessage).filter(ChatMessage.session_id == s.id).count()
            
            result.append({
                "id": s.session_id,  # Use the string UUID
                "title": s.session_title or "New Conversation",
                "lastMessage": last_msg.created_at if last_msg else s.updated_at,
                "messageCount": msg_count,
                "created_at": s.created_at
            })
            
        return {"success": True, "sessions": result}
    except Exception as e:
        print(f"Error fetching sessions: {e}")
        return {"success": False, "sessions": []}


@router.get("/sessions/{session_id}/messages", response_model=MessageListResponse)
async def get_session_messages(session_id: str, db: Session = Depends(get_db)):
    """Get messages for a specific session"""
    try:
        # Find session by string UUID
        session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
        if not session:
            return {"success": False, "messages": []}
            
        messages = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.asc())
            .all()
        )
        
        result = []
        for m in messages:
            result.append({
                "role": m.role,
                "content": m.content,
                "timestamp": m.created_at,
                "files": m.attached_files or []
            })
            
        return {"success": True, "messages": result}
    except Exception as e:
        print(f"Error fetching messages: {e}")
        return {"success": False, "messages": []}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a chat session"""
    try:
        session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
        if session:
            session.is_active = False  # Soft delete
            db.commit()
            return {"success": True, "message": "Session deleted"}
        return {"success": False, "message": "Session not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/message", response_model=ChatResponse)
async def send_chat_message(
    message: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    session_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Enhanced RAG chatbot with file processing, context awareness, and business-specific insights
    """
    try:
        # 1. Handle Session Management
        current_session = None
        if session_id:
            current_session = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
        
        if not current_session:
            # Create new session
            new_uuid = str(uuid.uuid4())
            current_session = ChatSession(
                session_id=new_uuid,
                session_title=message[:40] + "..." if len(message) > 40 else message,
                is_active=True
            )
            db.add(current_session)
            db.commit()
            db.refresh(current_session)
            session_id = new_uuid

        # 2. Save User Message
        user_msg = ChatMessage(
            session_id=current_session.id,
            role="user",
            content=message,
            attached_files=[f.filename for f in files] if files else []
        )
        db.add(user_msg)
        db.commit()

        # 3. Get Business Context
        business = (
            db.query(Business)
            .filter(Business.is_active == True)
            .order_by(Business.updated_at.desc())
            .first()
        )
        # Fallback
        if not business:
            business = (
                db.query(Business).order_by(Business.updated_at.desc()).first()
            ) or (
                db.query(Business).order_by(Business.created_at.desc()).first()
            )
        
        business_context = None
        if business:
            latest_forecast = (
                db.query(DemandForecast)
                .filter(DemandForecast.business_id == business.id)
                .order_by(DemandForecast.created_at.desc())
                .first()
            )
            
            business_context = {
                "business_name": business.name,
                "business_type": business.type,
                "business_scale": business.scale,
                "location": business.location,
                "state": business.state,
                "has_forecast_data": latest_forecast is not None
            }
            
            if latest_forecast:
                business_context.update({
                    "current_sales": latest_forecast.current_sales,
                    "forecast_period": latest_forecast.forecast_period_months,
                    "confidence_score": latest_forecast.confidence_score
                })
        
        if business_context:
            print(f"✅ Business context loaded: {business_context['business_type']} | {business_context['state']}")

        # 4. Process Files
        processed_files = []
        if files:
            upload_dir = "uploads"
            os.makedirs(upload_dir, exist_ok=True)
            
            for file in files:
                if file.filename:
                    file_path = os.path.join(upload_dir, file.filename)
                    with open(file_path, "wb") as f:
                        content = await file.read()
                        f.write(content)
                    
                    result = doc_processor.process_file(file_path, file.filename)
                    
                    if result["success"]:
                        doc_id = rag_service.add_document(
                            content=result["content"],
                            metadata={
                                "filename": file.filename,
                                "type": result["type"],
                                "summary": result.get("summary", ""),
                                "processed_at": datetime.now().isoformat(),
                                "business_type": business_context.get("business_type") if business_context else None,
                            }
                        )
                        processed_files.append({
                            "filename": file.filename,
                            "summary": result.get("summary", "")
                        })

        # 5. Retrieve Chat History for Context
        # Get last 5 messages from this session (excluding the one we just added)
        history_msgs = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == current_session.id)
            .filter(ChatMessage.id != user_msg.id) # Exclude current
            .order_by(ChatMessage.created_at.asc())
            .limit(5)
            .all()
        )
        
        chat_history = [
            {"role": m.role, "content": m.content} 
            for m in history_msgs
        ]

        # 6. Generate Response
        if message.strip() or processed_files:
            rag_response = rag_service.query(
                query=message,
                chat_history=chat_history,
                context_override=None,
                business_context=business_context
            )
            
            response_text = rag_response.get("response", "I couldn't generate a response.")
            
            # Prepend file info if needed
            if processed_files:
                file_msg = f"📎 Uploaded {len(processed_files)} file(s).\n\n"
                response_text = file_msg + response_text

            # 7. Save Assistant Response
            assistant_msg = ChatMessage(
                session_id=current_session.id,
                role="assistant",
                content=response_text,
                confidence_score=rag_response.get("confidence"),
                sources_used=rag_response.get("sources")
            )
            db.add(assistant_msg)
            
            # Update session timestamp
            current_session.updated_at = datetime.now()
            db.commit()

            return ChatResponse(
                success=True,
                response=response_text,
                session_id=session_id,
                sources=rag_response.get("sources", []),
                confidence=rag_response.get("confidence", 0.5)
            )
            
        return ChatResponse(success=False, response="No message provided")
    
    except Exception as e:
        print(f"Chat error: {e}")
        return ChatResponse(
            success=False,
            response="I apologize, but I encountered an error processing your request.",
            error=str(e)
        )


@router.get("/suggestions")
async def get_chat_suggestions():
    """Get suggested questions"""
    return {
        "success": True,
        "suggestions": rag_service.get_suggested_questions()
    }


@router.get("/documents")
async def get_uploaded_documents():
    """Get list of currently uploaded documents"""
    return {
        "success": True,
        "documents": rag_service.get_uploaded_documents(),
        "count": len(rag_service.documents)
    }


@router.get("/business-context")
async def get_business_context(db: Session = Depends(get_db)):
    """Get current business context"""
    try:
        business = (
            db.query(Business)
            .filter(Business.is_active == True)
            .order_by(Business.updated_at.desc())
            .first()
        )
        if not business:
            business = (
                db.query(Business).order_by(Business.updated_at.desc()).first()
            ) or (
                db.query(Business).order_by(Business.created_at.desc()).first()
            )

        if not business:
            return {
                "success": True,
                "has_context": False,
                "message": "No business settings configured."
            }
        
        latest_forecast = (
            db.query(DemandForecast)
            .filter(DemandForecast.business_id == business.id)
            .order_by(DemandForecast.created_at.desc())
            .first()
        )
        
        return {
            "success": True,
            "has_context": True,
            "business": {
                "name": business.name,
                "type": business.type,
                "scale": business.scale,
                "location": business.location,
                "state": business.state,
                "has_forecast": latest_forecast is not None,
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/clear")
async def clear_chat_history(db: Session = Depends(get_db)):
    """Clear uploaded documents (and optionally sessions)"""
    try:
        rag_service.clear_uploaded_documents()
        return {"success": True, "message": "Documents cleared"}
    except Exception as e:
        return {"success": False, "error": str(e)}
