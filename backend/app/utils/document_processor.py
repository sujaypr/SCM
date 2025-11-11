"""Document processing utilities for RAG chatbot"""
import pandas as pd
import json
import os
from typing import Dict, List, Any, Optional
from datetime import datetime
import uuid


class DocumentProcessor:
    """Process various document types for RAG system"""

    @staticmethod
    def process_csv(file_path: str) -> Dict[str, Any]:
        """Process CSV file and extract content"""
        try:
            df = pd.read_csv(file_path)
            
            # Generate summary
            summary = f"CSV file with {len(df)} rows and {len(df.columns)} columns. "
            summary += f"Columns: {', '.join(df.columns.tolist())}"
            
            # Extract key statistics
            stats = {
                "rows": len(df),
                "columns": len(df.columns),
                "column_names": df.columns.tolist(),
                "numeric_columns": df.select_dtypes(include=['number']).columns.tolist(),
                "sample_data": df.head(5).to_dict('records')
            }
            
            # Create text content for embedding
            content = f"Dataset Summary:\n{summary}\n\n"
            content += f"Sample Data:\n{df.head(10).to_string()}\n\n"
            content += f"Basic Statistics:\n{df.describe().to_string()}"
            
            return {
                "success": True,
                "content": content,
                "summary": summary,
                "metadata": stats,
                "type": "csv"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": "csv"
            }

    @staticmethod
    def process_excel(file_path: str) -> Dict[str, Any]:
        """Process Excel file and extract content"""
        try:
            # Read all sheets
            excel_file = pd.ExcelFile(file_path)
            sheet_names = excel_file.sheet_names
            
            all_content = []
            all_stats = {}
            
            for sheet in sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet)
                all_content.append(f"\n=== Sheet: {sheet} ===\n")
                all_content.append(df.head(10).to_string())
                
                all_stats[sheet] = {
                    "rows": len(df),
                    "columns": len(df.columns),
                    "column_names": df.columns.tolist()
                }
            
            summary = f"Excel file with {len(sheet_names)} sheets: {', '.join(sheet_names)}"
            content = "\n".join(all_content)
            
            return {
                "success": True,
                "content": content,
                "summary": summary,
                "metadata": {
                    "sheets": sheet_names,
                    "stats": all_stats
                },
                "type": "excel"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": "excel"
            }

    @staticmethod
    def process_json(file_path: str) -> Dict[str, Any]:
        """Process JSON file and extract content"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Convert to readable text
            content = json.dumps(data, indent=2)
            summary = f"JSON file with {len(str(data))} characters"
            
            if isinstance(data, dict):
                summary += f", {len(data)} top-level keys"
            elif isinstance(data, list):
                summary += f", containing {len(data)} items"
            
            return {
                "success": True,
                "content": content,
                "summary": summary,
                "metadata": {
                    "type": type(data).__name__,
                    "size": len(str(data))
                },
                "type": "json"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": "json"
            }

    @staticmethod
    def process_text(file_path: str) -> Dict[str, Any]:
        """Process plain text file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            lines = content.split('\n')
            summary = f"Text file with {len(lines)} lines, {len(content)} characters"
            
            return {
                "success": True,
                "content": content,
                "summary": summary,
                "metadata": {
                    "lines": len(lines),
                    "characters": len(content),
                    "words": len(content.split())
                },
                "type": "text"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": "text"
            }

    @staticmethod
    def process_file(file_path: str, filename: str) -> Dict[str, Any]:
        """Process file based on extension"""
        ext = filename.lower().split('.')[-1]
        
        processors = {
            'csv': DocumentProcessor.process_csv,
            'xlsx': DocumentProcessor.process_excel,
            'xls': DocumentProcessor.process_excel,
            'json': DocumentProcessor.process_json,
            'txt': DocumentProcessor.process_text,
        }
        
        processor = processors.get(ext)
        if processor:
            result = processor(file_path)
            result['filename'] = filename
            result['document_id'] = str(uuid.uuid4())
            result['processed_at'] = datetime.now().isoformat()
            return result
        else:
            return {
                "success": False,
                "error": f"Unsupported file type: {ext}",
                "filename": filename,
                "type": "unknown"
            }

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """Split text into overlapping chunks for better retrieval"""
        chunks = []
        start = 0
        text_len = len(text)
        
        while start < text_len:
            end = start + chunk_size
            chunk = text[start:end]
            
            # Try to break at sentence boundary
            if end < text_len:
                last_period = chunk.rfind('.')
                last_newline = chunk.rfind('\n')
                break_point = max(last_period, last_newline)
                
                if break_point > chunk_size * 0.5:  # At least 50% of chunk size
                    chunk = chunk[:break_point + 1]
                    end = start + break_point + 1
            
            chunks.append(chunk.strip())
            start = end - overlap
        
        return chunks

    @staticmethod
    def extract_key_info(content: str, file_type: str) -> Dict[str, Any]:
        """Extract key information from content for quick reference"""
        info = {
            "type": file_type,
            "length": len(content),
            "preview": content[:500] if len(content) > 500 else content
        }
        
        # Add type-specific info
        if file_type == "csv" or file_type == "excel":
            # Try to extract column names and row counts
            lines = content.split('\n')
            if len(lines) > 0:
                info["first_line"] = lines[0]
        
        return info
