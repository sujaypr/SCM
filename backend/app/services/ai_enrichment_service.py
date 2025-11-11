import json
import os
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from datetime import datetime


class AIEnrichmentService:
    """Service for AI-powered inventory data enrichment using Gemini"""
    
    def __init__(self):
        # Configure Gemini
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel("gemini-1.5-pro")
            self.ai_available = True
        else:
            self.model = None
            self.ai_available = False
    
    def enrich_inventory_data(
        self, 
        items: List[Dict], 
        business_info: Dict
    ) -> List[Dict]:
        """Enrich inventory data with AI-generated insights"""
        
        if not self.ai_available:
            # Return items with basic defaults if AI not available
            return self._apply_defaults(items, business_info)
        
        try:
            # Prepare prompt
            prompt = self._create_enrichment_prompt(items, business_info)
            
            # Get AI response
            response = self.model.generate_content(prompt)
            
            # Parse response
            enriched_data = self._parse_ai_response(response.text)
            
            # Merge with original data
            return self._merge_enrichments(items, enriched_data)
            
        except Exception as e:
            print(f"AI enrichment error: {e}")
            return self._apply_defaults(items, business_info)
    
    def generate_sku(self, item_name: str, category: str, index: int) -> str:
        """Generate SKU for an item"""
        
        # Extract business code (first 3 letters of category)
        cat_code = category[:3].upper() if category else "GEN"
        
        # Generate SKU
        return f"SKU-{cat_code}-{index:04d}"
    
    def suggest_category(self, item_name: str, business_type: str) -> str:
        """Suggest category based on item name and business type"""
        
        if not self.ai_available:
            return self._basic_categorization(item_name, business_type)
        
        try:
            prompt = f"""
            Business Type: {business_type}
            Product Name: {item_name}
            
            Suggest a single category name for this product (max 2 words).
            Return only the category name, nothing else.
            """
            
            response = self.model.generate_content(prompt)
            category = response.text.strip()
            
            # Validate response
            if len(category.split()) <= 3 and len(category) < 50:
                return category
            else:
                return self._basic_categorization(item_name, business_type)
                
        except Exception:
            return self._basic_categorization(item_name, business_type)
    
    def suggest_stock_levels(
        self, 
        item: Dict, 
        business_scale: str
    ) -> Dict[str, int]:
        """Suggest min and max stock levels based on business scale"""
        
        # Scale factors
        scale_factors = {
            "Micro": {"min_factor": 0.5, "max_factor": 1.5},
            "Small": {"min_factor": 1.0, "max_factor": 2.5},
            "Medium": {"min_factor": 2.0, "max_factor": 4.0},
            "Large": {"min_factor": 3.0, "max_factor": 6.0}
        }
        
        factors = scale_factors.get(business_scale, scale_factors["Small"])
        
        # Base calculations
        current_stock = int(item.get("current_stock", 0))
        
        # Calculate suggested levels
        if current_stock > 0:
            min_stock = max(5, int(current_stock * 0.3 * factors["min_factor"]))
            max_stock = int(current_stock * 2 * factors["max_factor"])
        else:
            # Default values if no current stock
            min_stock = int(10 * factors["min_factor"])
            max_stock = int(50 * factors["max_factor"])
        
        return {
            "min_stock_level": min_stock,
            "max_stock_level": max_stock,
            "reorder_point": int(min_stock * 1.2)
        }
    
    def _create_enrichment_prompt(self, items: List[Dict], business_info: Dict) -> str:
        """Create prompt for AI enrichment"""
        
        return f"""
        You are an inventory management expert for Indian retail businesses.
        
        Business Context:
        - Type: {business_info.get('type', 'General Store')}
        - Scale: {business_info.get('scale', 'Small')}
        - Location: {business_info.get('location', 'Urban')}
        
        Task: Enrich the following inventory items with:
        1. Category suggestions if missing
        2. SKU generation if missing (format: SKU-XXX-0001)
        3. Min/Max stock level recommendations if missing
        
        Items to enrich:
        {json.dumps(items[:10], indent=2)}  # Limit to first 10 items for token efficiency
        
        Return a JSON array with enriched items. Each item should have:
        - name: original name
        - category: suggested category
        - sku: generated SKU if missing
        - min_stock_level: recommended minimum
        - max_stock_level: recommended maximum
        - enrichment_notes: any additional suggestions
        
        Return ONLY valid JSON, no explanations.
        """
    
    def _parse_ai_response(self, response_text: str) -> List[Dict]:
        """Parse AI response to extract enriched data"""
        
        try:
            # Clean response text
            cleaned = response_text.strip()
            
            # Find JSON content
            if "```json" in cleaned:
                start = cleaned.find("```json") + 7
                end = cleaned.find("```", start)
                cleaned = cleaned[start:end].strip()
            elif "```" in cleaned:
                start = cleaned.find("```") + 3
                end = cleaned.find("```", start)
                cleaned = cleaned[start:end].strip()
            
            # Parse JSON
            return json.loads(cleaned)
            
        except Exception as e:
            print(f"Error parsing AI response: {e}")
            return []
    
    def _merge_enrichments(
        self, 
        original_items: List[Dict], 
        enrichments: List[Dict]
    ) -> List[Dict]:
        """Merge AI enrichments with original data"""
        
        enriched_items = []
        enrichment_map = {e.get("name"): e for e in enrichments}
        
        for item in original_items:
            enriched_item = item.copy()
            
            # Find matching enrichment
            enrichment = enrichment_map.get(item.get("name"))
            
            if enrichment:
                # Apply enrichments only if field is missing
                if not enriched_item.get("category"):
                    enriched_item["category"] = enrichment.get("category", "Uncategorized")
                
                if not enriched_item.get("sku"):
                    enriched_item["sku"] = enrichment.get("sku")
                
                if not enriched_item.get("min_stock_level"):
                    enriched_item["min_stock_level"] = enrichment.get("min_stock_level", 10)
                
                if not enriched_item.get("max_stock_level"):
                    enriched_item["max_stock_level"] = enrichment.get("max_stock_level", 100)
                
                # Add enrichment metadata
                enriched_item["ai_enriched"] = True
                enriched_item["enrichment_notes"] = enrichment.get("enrichment_notes")
            
            enriched_items.append(enriched_item)
        
        return enriched_items
    
    def _apply_defaults(self, items: List[Dict], business_info: Dict) -> List[Dict]:
        """Apply default enrichments without AI"""
        
        enriched_items = []
        business_scale = business_info.get("scale", "Small")
        
        for idx, item in enumerate(items):
            enriched_item = item.copy()
            
            # Generate SKU if missing
            if not enriched_item.get("sku"):
                category = enriched_item.get("category", "GEN")
                enriched_item["sku"] = self.generate_sku(
                    enriched_item.get("name", "Item"),
                    category,
                    idx + 1
                )
            
            # Set category if missing
            if not enriched_item.get("category"):
                enriched_item["category"] = self._basic_categorization(
                    enriched_item.get("name", ""),
                    business_info.get("type", "General")
                )
            
            # Set stock levels if missing
            if not enriched_item.get("min_stock_level") or not enriched_item.get("max_stock_level"):
                stock_suggestions = self.suggest_stock_levels(enriched_item, business_scale)
                
                if not enriched_item.get("min_stock_level"):
                    enriched_item["min_stock_level"] = stock_suggestions["min_stock_level"]
                
                if not enriched_item.get("max_stock_level"):
                    enriched_item["max_stock_level"] = stock_suggestions["max_stock_level"]
            
            enriched_items.append(enriched_item)
        
        return enriched_items
    
    def _basic_categorization(self, item_name: str, business_type: str) -> str:
        """Basic rule-based categorization"""
        
        name_lower = item_name.lower()
        
        # Electronics Store categories
        if "phone" in name_lower or "mobile" in name_lower:
            return "Phones"
        elif "headphone" in name_lower or "earphone" in name_lower:
            return "Audio"
        elif "cable" in name_lower or "charger" in name_lower:
            return "Accessories"
        elif "laptop" in name_lower or "computer" in name_lower:
            return "Computers"
        
        # Grocery Store categories
        elif "rice" in name_lower:
            return "Rice"
        elif "dal" in name_lower or "lentil" in name_lower:
            return "Pulses"
        elif "oil" in name_lower:
            return "Cooking Oil"
        elif "sugar" in name_lower or "salt" in name_lower:
            return "Essentials"
        
        # Clothing Store categories
        elif "shirt" in name_lower:
            return "Shirts"
        elif "pant" in name_lower or "jean" in name_lower:
            return "Bottoms"
        elif "dress" in name_lower or "kurti" in name_lower:
            return "Dresses"
        elif "saree" in name_lower or "sari" in name_lower:
            return "Traditional"
        
        # Default
        else:
            return "General"
