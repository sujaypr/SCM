from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Header, Depends
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
from sqlalchemy import create_engine, select

router = APIRouter()
rag_service = EnhancedRAGService()
doc_processor = DocumentProcessor()


class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: str


class ChatResponse(BaseModel):
    success: bool
    response: str
    sources: Optional[List[Dict[str, Any]]] = None
    confidence: Optional[float] = None
    error: Optional[str] = None


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
        # Get business settings from database (prefer most recent active business)
        business = (
            db.query(Business)
            .filter(Business.is_active == True)
            .order_by(Business.updated_at.desc())
            .first()
        )
        # Fallback: if no active business set, use the most recently updated or created
        if not business:
            business = (
                db.query(Business)
                .order_by(Business.updated_at.desc())
                .first()
            ) or (
                db.query(Business)
                .order_by(Business.created_at.desc())
                .first()
            )
        
        # Build business context for personalized responses
        business_context = None
        if business:
            # Get most recent forecast for this business
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
            print(f"✅ Business context loaded: {business_context['business_type']} | {business_context['business_scale']} | {business_context['state']}")
        else:
            print(f"⚠️ No business context found - responses will be generic")
        
        # Process uploaded files and add to persistent RAG knowledge base
        processed_files = []
        
        if files:
            upload_dir = "uploads"
            os.makedirs(upload_dir, exist_ok=True)
            
            for file in files:
                if file.filename:
                    # Save the file
                    file_path = os.path.join(upload_dir, file.filename)
                    with open(file_path, "wb") as f:
                        content = await file.read()
                        f.write(content)
                    
                    # Process file with document processor
                    result = doc_processor.process_file(file_path, file.filename)
                    
                    if result["success"]:
                        # Add to RAG knowledge base (persists for all future queries)
                        doc_id = rag_service.add_document(
                            content=result["content"],
                            metadata={
                                "filename": file.filename,
                                "type": result["type"],
                                "summary": result.get("summary", ""),
                                "processed_at": datetime.now().isoformat(),
                                # Business metadata for relevance filtering
                                "business_type": business_context.get("business_type") if business_context else None,
                                "business_scale": business_context.get("business_scale") if business_context else None,
                                "state": business_context.get("state") if business_context else None,
                                "location": business_context.get("location") if business_context else None,
                            }
                        )
                        
                        processed_files.append({
                            "filename": file.filename,
                            "type": result["type"],
                            "doc_id": doc_id,
                            "summary": result.get("summary", "")
                        })
                    else:
                        processed_files.append({
                            "filename": file.filename,
                            "error": result.get("error", "Processing failed")
                        })
        
        # Generate response using enhanced RAG (retrieves from all uploaded docs)
        if message.strip():
            # Query with RAG - it will retrieve relevant docs from knowledge base
            rag_response = rag_service.query(
                query=message,
                chat_history=None,  # Can be extended with session history
                context_override=None,  # Let RAG retrieve naturally from all documents
                business_context=business_context  # Pass business-specific context
            )
            
            # Check if RAG query failed
            if not rag_response.get("success", True):
                error_msg = rag_response.get("error", "Unknown error")
                print(f"❌ RAG query failed: {error_msg}")
                return ChatResponse(
                    success=False,
                    response=f"AI service error: {error_msg}",
                    error=error_msg
                )
            
            # Build final response (no personalization banner or warnings)
            response_text = rag_response["response"]
            
            # Add file acknowledgment if files were just uploaded
            if processed_files:
                file_msg = f"📎 Uploaded and processed {len(processed_files)} file(s): " + ", ".join([
                    f['filename'] for f in processed_files if 'filename' in f
                ])
                file_msg += f"\n✓ Documents added to knowledge base and will be used for all future queries.\n\n"
                response_text = file_msg + response_text
            
            # Add context info if using uploaded documents
            elif rag_response.get("sources"):
                uploaded_sources = [s for s in rag_response["sources"] if s.get("category") == "uploaded_document"]
                if uploaded_sources:
                    doc_count = len(rag_service.documents)
                    response_text += f"\n\n💡 Using context from {doc_count} uploaded document(s) in knowledge base."
            
            return ChatResponse(
                success=True,
                response=response_text,
                sources=rag_response.get("sources", []),
                confidence=rag_response.get("confidence", 0.5)
            )
        
        elif processed_files:
            # Only files, no message
            summaries = []
            for f in processed_files:
                if 'summary' in f:
                    summaries.append(f"📄 {f['filename']}: {f['summary']}")
            
            response_text = "I've processed your file(s):\n\n" + "\n".join(summaries)
            response_text += "\n\nWhat would you like to know about this data?"
            
            return ChatResponse(
                success=True,
                response=response_text
            )
        else:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "error": "No message or files provided"
                }
            )
    
    except Exception as e:
        print(f"Chat error: {e}")
        return ChatResponse(
            success=False,
            response="I apologize, but I encountered an error processing your request. Please try again.",
            error=str(e)
        )


@router.get("/suggestions")
async def get_chat_suggestions():
    """
    Get suggested questions/prompts for the chatbot
    """
    return {
        "success": True,
        "suggestions": rag_service.get_suggested_questions()
    }


@router.get("/documents")
async def get_uploaded_documents():
    """
    Get list of currently uploaded documents in RAG system
    """
    return {
        "success": True,
        "documents": rag_service.get_uploaded_documents(),
        "count": len(rag_service.documents)
    }


@router.get("/business-context")
async def get_business_context(db: Session = Depends(get_db)):
    """
    Get current business context being used for personalized responses
    """
    try:
        business = (
            db.query(Business)
            .filter(Business.is_active == True)
            .order_by(Business.updated_at.desc())
            .first()
        )
        if not business:
            business = (
                db.query(Business)
                .order_by(Business.updated_at.desc())
                .first()
            ) or (
                db.query(Business)
                .order_by(Business.created_at.desc())
                .first()
            )

        if not business:
            return {
                "success": True,
                "has_context": False,
                "message": "No business settings configured. Responses will be generic. Go to Settings to configure your business profile."
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
                "current_sales": latest_forecast.current_sales if latest_forecast else None,
                "last_updated": business.updated_at.isoformat() if business.updated_at else None
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.delete("/clear")
async def clear_chat_history():
    """
    Clear uploaded documents from RAG knowledge base
    """
    try:
        rag_service.clear_uploaded_documents()
        return {
            "success": True,
            "message": "Chat history and uploaded documents cleared"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
