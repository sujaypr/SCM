# Inventory Management - Implementation Plan

## Overview

Replace mock-data inventory with real database + CSV import + AI enrichment.

---

## Current State

**Problem**: Using mock data, no real persistence
**Assets**: Database models ready, API endpoints exist, Gemini integrated

---

## Solution

1. **CSV Import**: Upload → Map columns → Import
2. **Database**: Use existing SQLite models
3. **AI**: Auto-generate SKUs, categories, stock levels
4. **UI**: Clean table with CRUD operations

---

## Implementation Details

### Components to Build

**Frontend (New)**:
- `CSVUploadModal.jsx` - Drag & drop CSV with column mapping
- `InventoryTable.jsx` - Replace current list with editable table
- `useInventory.js` - Hook for API calls

**Backend (Modify)**:
- `inventory_service.py` - Remove mock data, use SQLAlchemy
- Add CSV parser & validator
- Add Gemini enrichment

### CSV Format
```csv
name,category,sku,current_stock,min_stock,unit_cost,selling_price
```
*Required: name, current_stock | Auto-generated: sku, category, min_stock*

### API Endpoints
```
POST /api/inventory/upload   # CSV import
GET  /api/inventory/export   # CSV export  
POST /api/inventory/enrich   # AI enhancement
```

---

## Implementation Steps

### Week 1 - Core
1. Remove mock data from `inventory_service.py`
2. Connect SQLAlchemy to existing models
3. Build CSV upload endpoint
4. Create CSVUploadModal component
5. Update InventoryManagement.jsx to use real data

### Week 2 - Enhancement
6. Add column mapping UI
7. Integrate Gemini for auto-enrichment
8. Add validation & error handling
9. Build analytics dashboard

### Week 3 - Polish
10. Add tests
11. Optimize performance
12. Deploy

---

## Summary

**What**: CSV-based inventory with AI enrichment  
**Why**: Replace mock data with real system  
**How**: SQLite + FastAPI + React + Gemini  
**When**: 3 weeks  

✅ **Ready to implement**
