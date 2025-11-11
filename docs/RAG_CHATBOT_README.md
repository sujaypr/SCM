# RAG Chatbot Implementation Guide

## Overview

This document describes the comprehensive Retrieval-Augmented Generation (RAG) chatbot system integrated into the Supply Chain Management platform. The chatbot provides intelligent responses about supply chain operations, Indian retail market insights, inventory management, and more.

## Architecture

### Technology Stack

- **AI Model**: Google Gemini 2.5 Flash Lite (`gemini-2.5-flash-lite`)
- **Vector Similarity**: TF-IDF with Cosine Similarity (scikit-learn)
- **Document Processing**: Pandas, JSON
- **Backend**: FastAPI
- **Database**: SQLAlchemy with SQLite/PostgreSQL
- **Frontend**: React with modern UI

### Core Components

1. **Enhanced RAG Service** (`enhanced_rag_service.py`)
   - Manages knowledge base with supply chain documents
   - Performs vector similarity search for document retrieval
   - Generates responses using Gemini AI
   - Supports file upload and processing

2. **Document Processor** (`document_processor.py`)
   - Processes CSV, Excel, JSON, and text files
   - Extracts metadata and summaries
   - Chunks large documents for better retrieval

3. **Chat API Routes** (`routes/chat.py`)
   - Handles chat messages and file uploads
   - Integrates with RAG service
   - Provides session management

4. **Database Models** (`models/db_models.py`)
   - `ChatSession`: Stores chat sessions
   - `ChatMessage`: Stores individual messages
   - `DocumentStore`: Stores processed documents

## Features

### ✅ Knowledge Base
Pre-loaded with Indian retail supply chain intelligence:
- Indian retail market statistics
- Festival impact analysis (Diwali, Dussehra, etc.)
- Inventory management best practices
- Seasonal demand patterns
- Supply chain optimization strategies
- E-commerce integration guidance

### ✅ Document Processing
Supports multiple file formats:
- **CSV**: Automatically analyzes columns, rows, and statistics
- **Excel**: Processes multiple sheets
- **JSON**: Parses and extracts structure
- **Text**: Reads and indexes plain text

### ✅ RAG Pipeline
1. **Retrieval**: TF-IDF vectorization with cosine similarity
2. **Augmentation**: Context from retrieved documents
3. **Generation**: Gemini AI generates contextual responses

### ✅ Smart Features
- Context-aware responses
- File upload and analysis
- Confidence scores
- Source attribution
- Fallback responses when AI unavailable

## API Endpoints

### POST `/api/chat/message`
Send a message and optionally upload files.

**Request:**
```
Content-Type: multipart/form-data

- message: string (required)
- files: File[] (optional)
- session_id: string (optional)
```

**Response:**
```json
{
  "success": true,
  "response": "AI-generated response...",
  "sources": [
    {
      "content": "Retrieved document content",
      "relevance_score": 0.85,
      "source": "Knowledge Base Title",
      "category": "market_intelligence"
    }
  ],
  "confidence": 0.92
}
```

### GET `/api/chat/suggestions`
Get suggested questions.

**Response:**
```json
{
  "success": true,
  "suggestions": [
    "What's the impact of Diwali on retail sales in India?",
    "How can I optimize my inventory management?",
    ...
  ]
}
```

### DELETE `/api/chat/clear`
Clear uploaded documents.

**Response:**
```json
{
  "success": true,
  "message": "Chat history and uploaded documents cleared"
}
```

## Configuration

### Environment Variables

```env
# Gemini AI Configuration
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite

# Database
DATABASE_URL=sqlite:///ai_supplychain.db
SQL_ECHO=false
```

### Frontend Configuration

The chat UI is located at `frontend/src/pages/WhatIfScenarios.jsx` and features:
- Modern message bubbles with avatars
- File upload with drag-and-drop
- Real-time typing indicators
- Auto-scroll to latest messages
- Responsive design

## Usage Examples

### Example 1: Ask About Market Insights
```
User: What's the impact of Diwali on retail sales?

AI: Diwali is the biggest retail opportunity in India, driving 50-70% sales 
increase across categories like electronics, clothing, jewelry, and sweets. 
Preparation should begin 6-8 weeks in advance. Festival seasons can account 
for 40-50% of annual sales for many retailers.
```

### Example 2: Upload and Analyze CSV
```
User: [Uploads sales_data.csv] Can you analyze this sales data?

AI: 📎 Processed 1 file(s): sales_data.csv

I've received your CSV file with 1000 rows and 5 columns (Date, Product, 
Quantity, Price, Region). Based on the data, I can see your top-selling 
products are concentrated in the electronics category. Would you like me 
to provide specific recommendations for inventory optimization?
```

### Example 3: Supply Chain Optimization
```
User: How can I reduce my logistics costs?

AI: To reduce logistics costs for MSMEs, consider: 1) Consolidate shipments 
to reduce individual delivery costs, 2) Use local suppliers when possible 
to minimize transportation, 3) Negotiate better payment terms with suppliers, 
4) Track delivery performance metrics, 5) Consider drop-shipping for 
slow-moving items. These strategies can reduce costs by 15-25%.
```

## RAG Workflow

```
┌─────────────────┐
│  User Query     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  TF-IDF         │
│  Vectorization  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Cosine         │
│  Similarity     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Top-K          │
│  Documents      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Gemini AI      │
│  Generation     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Response       │
└─────────────────┘
```

## Database Schema

### chat_sessions
- id: Integer (PK)
- session_id: String (Unique)
- user_session_id: Integer (FK)
- session_title: String
- context_data: JSON
- created_at, updated_at: DateTime
- is_active: Boolean

### chat_messages
- id: Integer (PK)
- session_id: Integer (FK)
- role: String ('user' or 'assistant')
- content: Text
- sources_used: JSON
- confidence_score: Float
- tokens_used: Integer
- attached_files: JSON
- created_at: DateTime

### document_store
- id: Integer (PK)
- document_id: String (Unique)
- source: String
- document_type: String
- content: Text
- embedding: JSON
- metadata: JSON
- business_id: Integer (FK)
- is_public: Boolean
- created_at, updated_at: DateTime

## Performance Optimization

### Vector Search
- TF-IDF with 500 max features
- Cosine similarity for fast retrieval
- Top-K selection with threshold filtering
- Document chunking for large files

### Caching Strategy
- Knowledge base pre-loaded at startup
- Document vectors cached after processing
- Rebuild index only when documents change

### Token Optimization
- Context limited to top-3 relevant documents
- Response max length: 500 tokens
- Temperature: 0.7 for balanced creativity

## Error Handling

1. **Gemini API Unavailable**: Falls back to knowledge base responses
2. **File Processing Errors**: Returns error message with file type
3. **Database Errors**: Graceful degradation to in-memory storage
4. **Invalid Queries**: Provides helpful suggestions

## Future Enhancements

### Planned Features
- [ ] Conversation history persistence
- [ ] Multi-turn context awareness
- [ ] Vector database integration (Pinecone/Chroma)
- [ ] Advanced embeddings (sentence-transformers)
- [ ] Chat session management UI
- [ ] Export chat history
- [ ] Multi-language support
- [ ] Voice input/output

### Scaling Considerations
- Move to dedicated vector database
- Implement embedding cache
- Add rate limiting
- Load balancing for multiple users
- Redis for session management

## Testing

### Unit Tests
```python
# Test RAG service
def test_rag_query():
    service = EnhancedRAGService()
    result = service.query("What is Diwali impact?")
    assert result["success"] == True
    assert len(result["sources"]) > 0
```

### Integration Tests
```python
# Test chat endpoint
def test_chat_message(client):
    response = client.post(
        "/api/chat/message",
        data={"message": "Hello"}
    )
    assert response.status_code == 200
    assert response.json()["success"] == True
```

## Troubleshooting

### Common Issues

**1. Gemini API Key Not Working**
- Check `.env` file has correct `GEMINI_API_KEY`
- Verify API key is active in Google AI Studio
- System falls back to basic responses if key missing

**2. File Upload Fails**
- Ensure `uploads/` directory exists and has write permissions
- Check file size limits (default: 10MB)
- Verify file format is supported

**3. Low Confidence Responses**
- Add more relevant documents to knowledge base
- Improve query specificity
- Check if uploaded files contain relevant data

**4. Database Errors**
- Run `python -m app.utils.db` to initialize tables
- Check DATABASE_URL in `.env`
- Verify SQLAlchemy models are imported

## Contributing

### Adding Knowledge Base Documents
```python
# In enhanced_rag_service.py
knowledge_base = [
    {
        "id": "kb_new",
        "title": "New Topic",
        "content": "Detailed information...",
        "tags": ["tag1", "tag2"],
        "category": "category_name"
    }
]
```

### Supporting New File Types
```python
# In document_processor.py
def process_new_format(file_path: str):
    # Implement processing logic
    return {
        "success": True,
        "content": extracted_text,
        "summary": summary,
        "type": "new_format"
    }
```

## License

This chatbot implementation is part of the AI Supply Chain Management Platform.

## Support

For issues or questions:
- Check logs in `logs/` directory
- Review API documentation at `/docs`
- Consult project README.md

---

**Last Updated**: November 2025  
**Version**: 1.0.0  
**Gemini Model**: gemini-2.5-flash-lite
