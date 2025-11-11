"""Enhanced RAG Service with Gemini AI integration for Supply Chain Chatbot"""
from typing import Dict, List, Any, Optional
import json
import os
import uuid
from datetime import datetime
import time

try:
    import google.generativeai as genai
except Exception:
    genai = None

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash-lite')

if genai is None:
    raise RuntimeError("google.generativeai module not installed. Please install it: pip install google-generativeai")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not found in environment variables. Please set it in your .env file.")

try:
    # Force REST transport to avoid gRPC envelope issues on some networks
    genai.configure(api_key=GEMINI_API_KEY, transport="rest")
    print(f"✅ Gemini AI configured for RAG with model: {GEMINI_MODEL}")
except Exception as e:
    raise RuntimeError(f"❌ Gemini configuration failed: {e}")


class EnhancedRAGService:
    """Enhanced RAG service with Gemini AI and vector similarity search"""

    def __init__(self):
        self.knowledge_base = self._initialize_knowledge_base()
        self.documents = []  # Store for uploaded documents
        self.vectorizer = TfidfVectorizer(max_features=500, stop_words='english')
        self.document_vectors = None
        self._build_document_index()

    def _initialize_knowledge_base(self) -> List[Dict[str, Any]]:
        """Initialize knowledge base with supply chain documents"""
        return [
            {
                "id": "kb_001",
                "title": "Indian Retail Market Overview",
                "content": """The Indian retail market is valued at ₹75 lakh crore (2024) with a 12-15% annual growth rate. 
                MSME retailers contribute 45% of the total market. Online penetration is at 8.5% and growing rapidly. 
                The retail sector employs over 40 million people and is crucial for India's economy. Key growth drivers include 
                rising middle class, urbanization, and digital adoption.""",
                "tags": ["market", "retail", "india", "statistics"],
                "category": "market_intelligence"
            },
            {
                "id": "kb_002",
                "title": "Festival Impact on Indian Retail",
                "content": """Indian festivals significantly impact retail demand patterns. Major festivals can drive 30-70% sales 
                increases depending on the business category and product relevance. Festival preparation timing varies by category - 
                typically 4-8 weeks in advance for most retailers. Regional festivals, wedding seasons, and national celebrations 
                create distinct demand peaks throughout the year. Each business type experiences different festival impacts based 
                on their product categories and customer demographics.""",
                "tags": ["festival", "sales", "seasonal", "demand patterns"],
                "category": "seasonal_intelligence"
            },
            {
                "id": "kb_003",
                "title": "Inventory Management Best Practices",
                "content": """Effective inventory management is crucial for MSMEs. Key practices include: 1) Maintain optimal stock 
                levels using 80-20 rule, 2) Implement Just-In-Time (JIT) for fast-moving items, 3) Use ABC analysis for 
                categorization, 4) Set safety stock levels based on lead time and demand variability, 5) Regular stock audits, 
                6) Use inventory management software, 7) Build strong supplier relationships for better terms.""",
                "tags": ["inventory", "management", "best practices", "optimization"],
                "category": "operational_guidance"
            },
            {
                "id": "kb_004",
                "title": "Seasonal Demand Patterns",
                "content": """Monsoon season (June-September) typically sees reduced footfall but increased demand for essentials, 
                umbrellas, and indoor entertainment. Winter season (December-February) coincides with festival and wedding seasons, 
                showing highest demand. Summer (March-May) is ideal for promotions to clear inventory. Understanding these patterns 
                helps optimize inventory and marketing.""",
                "tags": ["seasonal", "demand", "patterns", "weather"],
                "category": "demand_intelligence"
            },
            {
                "id": "kb_005",
                "title": "Supply Chain Optimization",
                "content": """Supply chain optimization for MSMEs involves: 1) Negotiate better payment terms with suppliers, 
                2) Consolidate shipments to reduce costs, 3) Use local suppliers when possible, 4) Implement vendor management 
                system, 5) Track delivery performance metrics, 6) Build inventory buffers for critical items, 7) Use data 
                analytics for demand forecasting, 8) Consider drop-shipping for slow-moving items.""",
                "tags": ["supply chain", "optimization", "logistics", "cost reduction"],
                "category": "operational_guidance"
            },
            {
                "id": "kb_006",
                "title": "E-commerce Integration Strategies",
                "content": """Integrating e-commerce helps MSMEs reach wider audiences. Start with: 1) List on popular marketplaces 
                (Amazon, Flipkart), 2) Create social media presence (Instagram, Facebook shops), 3) Use WhatsApp Business for 
                customer engagement, 4) Implement digital payment systems (UPI, wallets), 5) Offer home delivery in local area, 
                6) Maintain consistent online-offline pricing, 7) Use customer reviews for improvement.""",
                "tags": ["ecommerce", "digital", "online", "marketplace"],
                "category": "digital_transformation"
            }
        ]

    def _build_document_index(self):
        """Build TF-IDF vectors for documents"""
        all_docs = self.knowledge_base + self.documents
        if len(all_docs) > 0:
            texts = [doc["content"] for doc in all_docs]
            try:
                self.document_vectors = self.vectorizer.fit_transform(texts)
            except:
                self.document_vectors = None

    def add_document(self, content: str, metadata: Dict[str, Any]) -> str:
        """Add a document to the knowledge base"""
        doc_id = str(uuid.uuid4())
        document = {
            "id": doc_id,
            "content": content,
            "metadata": metadata,
            "added_at": datetime.now().isoformat(),
            "category": "uploaded_document"
        }
        self.documents.append(document)
        self._build_document_index()  # Rebuild index
        return doc_id

    def retrieve_relevant_documents(
        self, query: str, top_k: int = 3, threshold: float = 0.1
    ) -> List[Dict[str, Any]]:
        """Retrieve most relevant documents using TF-IDF similarity"""
        if self.document_vectors is None:
            return []

        try:
            query_vector = self.vectorizer.transform([query])
            similarities = cosine_similarity(query_vector, self.document_vectors)[0]
            
            # Get top-k documents above threshold
            all_docs = self.knowledge_base + self.documents
            doc_scores = list(zip(all_docs, similarities))
            doc_scores.sort(key=lambda x: x[1], reverse=True)
            
            relevant_docs = []
            for doc, score in doc_scores[:top_k]:
                if score >= threshold:
                    relevant_docs.append({
                        "content": doc["content"],
                        "relevance_score": float(score),
                        "source": doc.get("title", doc.get("id", "Unknown")),
                        "category": doc.get("category", "general"),
                        "metadata": doc.get("metadata", {})
                    })
            
            return relevant_docs
        except Exception as e:
            print(f"Error in document retrieval: {e}")
            return []

    def generate_response_with_gemini(
        self, 
        query: str, 
        context: List[Dict[str, Any]],
        chat_history: List[Dict[str, str]] = None,
        business_context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Generate response using Gemini AI with retrieved context and business-specific information"""
        
        print(f"✅ Using Gemini AI for response")
        print(f"📊 Business context available: {business_context is not None}")
        if business_context:
            print(f"   - Type: {business_context.get('business_type')}")
            print(f"   - Scale: {business_context.get('business_scale')}")
            print(f"   - Location: {business_context.get('state')}")

        try:
            # Build context string
            if context and len(context) > 0:
                context_str = "\n\n".join([
                    f"Source: {doc['source']}\nRelevance: {doc['relevance_score']:.2f}\nContent: {doc['content'][:500]}..."
                    for doc in context[:3]
                ])
            else:
                context_str = "No uploaded documents or specific context available. Use your general knowledge to answer."

            # Do not inject business profile into prompt; generate general responses
            business_str = ""

            # Build chat history string
            history_str = ""
            if chat_history:
                history_str = "\n".join([
                    f"{msg['role']}: {msg['content']}"
                    for msg in chat_history[-3:]  # Last 3 messages
                ])

            # Create a general-purpose prompt (not tailored to a specific business)
            prompt = f"""You are a helpful AI assistant for supply chain, logistics, operations, and general business queries in India and globally.

Context Information:
{context_str}

{f"Previous Conversation:{history_str}" if history_str else ""}

User Query: {query}

INSTRUCTIONS:
- Answer the user's question directly and helpfully for any industry or business type.
- Use provided context if relevant; otherwise rely on your general knowledge.
- Provide practical, actionable steps when appropriate.
- Be concise but comprehensive.

Response:"""

            model = genai.GenerativeModel(GEMINI_MODEL)
            # Retry generate_content to mitigate transient network issues
            last_err = None
            for attempt in range(3):
                try:
                    response = model.generate_content(
                        prompt,
                        generation_config=genai.types.GenerationConfig(
                            max_output_tokens=1000,
                            temperature=0.7
                        )
                    )
                    break
                except Exception as ge:
                    last_err = ge
                    print(f"⚠️ generate_content attempt {attempt+1} failed: {ge}")
                    if attempt < 2:
                        time.sleep(1.5 * (attempt + 1))
                    else:
                        raise last_err
            
            print(f"✅ Gemini response generated successfully")

            return {
                "success": True,
                "response": response.text,
                "sources": context,
                "model": GEMINI_MODEL,
                "tokens_used": response.usage_metadata.total_token_count if hasattr(response, 'usage_metadata') else None
            }

        except Exception as e:
            print(f"❌ Gemini API error: {e}")
            import traceback
            traceback.print_exc()
            # Return error response instead of fallback
            return {
                "success": False,
                "response": f"AI service error: {str(e)}. Please check your API configuration and try again.",
                "sources": context,
                "model": None,
                "tokens_used": 0,
                "error": str(e)
            }


    def query(
        self, 
        query: str, 
        chat_history: List[Dict[str, str]] = None,
        context_override: List[Dict[str, Any]] = None,
        business_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Main query method that orchestrates RAG pipeline with business-specific context"""
        
        # Step 1: Retrieve relevant documents
        if context_override:
            relevant_docs = context_override
        else:
            # Retrieve documents consistently (no business-type filtering)
            top_k = 5
            threshold = 0.1
            relevant_docs = self.retrieve_relevant_documents(query, top_k=top_k, threshold=threshold)

        if relevant_docs:
            print(f"🔍 Context sources being used: {[d.get('source', 'Unknown')[:30] for d in relevant_docs]}")
        else:
            print(f"ℹ️ No relevant documents found - will use AI general knowledge with business context")

        # Step 2: Generate response with Gemini (include business context)
        result = self.generate_response_with_gemini(query, relevant_docs, chat_history, business_context)

        # Step 3: Calculate confidence
        avg_relevance = sum(doc.get("relevance_score", 0) for doc in relevant_docs) / max(len(relevant_docs), 1)
        confidence = min(avg_relevance * 1.5, 1.0) if relevant_docs else 0.3

        return {
            "query": query,
            "response": result["response"],
            "sources": result["sources"],
            "confidence": confidence,
            "model_used": result.get("model"),
            "tokens_used": result.get("tokens_used")
        }

    def get_suggested_questions(self) -> List[str]:
        """Get suggested questions based on knowledge base"""
        return [
            "What's the impact of Diwali on retail sales in India?",
            "How can I optimize my inventory management?",
            "Tell me about seasonal demand patterns in India",
            "What are effective supply chain optimization strategies for small businesses?",
            "How should I prepare for festival season?",
            "What are the best practices for e-commerce integration?",
            "How can I reduce logistics costs?",
            "What are the growth trends in Indian retail market?"
        ]
    
    def get_uploaded_documents(self) -> List[Dict[str, Any]]:
        """Get list of currently uploaded documents"""
        return [
            {
                "id": doc.get("id"),
                "filename": doc.get("metadata", {}).get("filename", "Unknown"),
                "type": doc.get("metadata", {}).get("type", "Unknown"),
                "added_at": doc.get("added_at"),
                "summary": doc.get("metadata", {}).get("summary", "")
            }
            for doc in self.documents
        ]

    def clear_uploaded_documents(self):
        """Clear all uploaded documents"""
        self.documents = []
        self._build_document_index()
