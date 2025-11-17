from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from typing import AsyncGenerator, Dict, Any
import asyncio
import json
from datetime import datetime
from dateutil.relativedelta import relativedelta

from app.utils.db import get_engine
from app.services.inventory_service import InventoryService
from app.services.logistics_service import LogisticsService
from app.models.db_models import DemandForecast, Business
from app.services.demand_service import DemandService

router = APIRouter()

def _parse_iso_date(ds: str):
    if not ds:
        return None
    try:
        return datetime.fromisoformat(ds)
    except Exception:
        try:
            return datetime.strptime(ds.split("T")[0], "%Y-%m-%d")
        except Exception:
            return None


def _compute_forecast_signals(df_row) -> Dict[str, Any]:
    try:
        blob = df_row.monthly_projections or {}
        forecast = {
            "product_demands": blob.get("product_demands"),
            "festival_demands": blob.get("festival_demands"),
            "seasonal_demands": blob.get("seasonal_demands"),
            "forecast_start": blob.get("forecast_start"),
            "forecast_end": blob.get("forecast_end"),
        }
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        # Determine window end: prefer forecast_end if it's in the future, else today + forecast_period months
        window_end = _parse_iso_date(forecast.get("forecast_end"))
        if not window_end or window_end.date() < today.date():
            months = getattr(df_row, 'forecast_period_months', None)
            try:
                months = int(months) if months is not None else 6
            except Exception:
                months = 6
            window_end = today + relativedelta(months=months)
        window_end = window_end.replace(hour=23, minute=59, second=59, microsecond=0)
        # Window start clamped to today
        fstart = _parse_iso_date(forecast.get("forecast_start"))
        window_start = today if not fstart or fstart.date() < today.date() else fstart.replace(hour=0, minute=0, second=0, microsecond=0)

        next_fest = None
        try:
            chart = (forecast.get("festival_demands") or {}).get("chart") or []
            # Merge with official calendar to ensure major upcoming festivals appear
            try:
                ds = DemandService()
                years = set([window_start.year, window_end.year])
                cal_items = []
                for y in years:
                    cal = ds.get_festival_calendar(y)
                    # major_festivals
                    for m in cal.get('major_festivals', []):
                        cal_items.append({
                            "festival": m.get('name'),
                            "date": f"{y}-{m.get('date', '').split('-')[-2]}-{m.get('date', '').split('-')[-1]}" if isinstance(m.get('date'), str) and len(m.get('date'))==10 else m.get('date') or f"{y}-12-25",
                            "month": m.get('date', '').split('-')[1] if isinstance(m.get('date'), str) and len(m.get('date'))==10 else None,
                            "year": y,
                            "demand_increase": {"Very High":70, "High":45, "Medium":25}.get(m.get('impact','Medium'), 20)
                        })
                    # regional_festivals
                    for r in cal.get('regional_festivals', []):
                        cal_items.append({
                            "festival": r.get('name'),
                            "date": r.get('date'),
                            "month": r.get('date', '').split('-')[1] if isinstance(r.get('date'), str) and len(r.get('date'))==10 else None,
                            "year": y,
                            "demand_increase": {"Very High":60, "High":38, "Medium":20}.get(r.get('impact','Medium'), 18)
                        })
                # Normalize merge by (festival,date)
                merged = {}
                for d in (chart + cal_items):
                    label = d.get('festival')
                    ds_ = d.get('date')
                    ts = _parse_iso_date(ds_)
                    if not (label and ts):
                        continue
                    key = f"{label}|{ts.date().isoformat()}"
                    if key not in merged:
                        merged[key] = {
                            "festival": label,
                            "date": ts.isoformat(),
                            "demand_increase": float(d.get('demand_increase') or 0)
                        }
                    else:
                        # keep max increase
                        merged[key]['demand_increase'] = max(merged[key]['demand_increase'], float(d.get('demand_increase') or 0))
                chart = list(merged.values())
            except Exception:
                pass
            fest = []
            for d in chart:
                ds = d.get("date")
                if not ds:
                    continue
                ts = _parse_iso_date(ds)
                if ts and ts > window_start and ts <= window_end:
                    try:
                        inc = float(d.get("demand_increase") or 0)
                    except Exception:
                        inc = 0
                    fest.append({
                        "label": d.get("festival"),
                        "date": ts.isoformat(),
                        "demand_increase": inc,
                    })
            fest.sort(key=lambda x: x["date"])  # ISO sort ok
            if fest:
                # compute days away
                dt = datetime.fromisoformat(fest[0]["date"]) if isinstance(fest[0]["date"], str) else fest[0]["date"]
                diff_days = (dt.date() - today.date()).days
                next_fest = {**fest[0], "daysAway": diff_days}
        except Exception:
            next_fest = None

        current_season = None
        try:
            seasons = (forecast.get("seasonal_demands") or {}).get("chart") or []
            today_iso = today.date().isoformat()
            active = []
            for s in seasons:
                st = s.get("start")
                en = s.get("end")
                if not (st and en):
                    continue
                try:
                    st_dt = datetime.fromisoformat(st)
                    en_dt = datetime.fromisoformat(en)
                except Exception:
                    try:
                        st_dt = datetime.strptime(st.split("T")[0], "%Y-%m-%d")
                        en_dt = datetime.strptime(en.split("T")[0], "%Y-%m-%d")
                    except Exception:
                        continue
                if st_dt.date().isoformat() <= today_iso <= en_dt.date().isoformat():
                    try:
                        surge = float(s.get("demand_surge") or 0)
                    except Exception:
                        surge = 0
                    active.append({
                        "name": s.get("season"),
                        "start": st_dt.isoformat(),
                        "end": en_dt.isoformat(),
                        "demand_surge": surge,
                    })
            if active:
                active.sort(key=lambda x: x.get("demand_surge", 0), reverse=True)
                current_season = active[0]
        except Exception:
            current_season = None

        return {
            "next_festival": next_fest,
            "current_season": current_season,
            "window": {"start": window_start.isoformat(), "end": window_end.isoformat()},
        }
    except Exception:
        return {"next_festival": None, "current_season": None, "window": None}


@router.get("/summary")
async def dashboard_summary(business_id: int = Query(1, description="Business ID")):
    try:
        engine = get_engine()
        SessionLocal = sessionmaker(bind=engine) if engine else None

        inv_analytics = {}
        low_stock = []
        logistics_stats = {}
        recent_shipments = []
        forecast_signals = {"next_festival": None, "current_season": None}

        if SessionLocal:
            db = SessionLocal()
            try:
                inv = InventoryService(db)
                inv_analytics = inv.get_analytics(business_id)
                low_stock = inv.get_low_stock_items(business_id)[:10]
                # Forecast signals: pick the most recent forecast whose end date is in the future
                rows = db.execute(
                    select(DemandForecast).order_by(DemandForecast.created_at.desc()).limit(5)
                ).scalars().all()
                chosen = None
                today0 = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                for r in rows:
                    try:
                        blob = r.monthly_projections or {}
                        fe = _parse_iso_date((blob or {}).get("forecast_end"))
                        if fe and fe.date() >= today0.date():
                            chosen = r
                            break
                    except Exception:
                        continue
                if not chosen and rows:
                    chosen = rows[0]
                if chosen:
                    forecast_signals = _compute_forecast_signals(chosen)
            finally:
                db.close()
        else:
            inv_analytics = {
                "total_items": 0,
                "total_value": 0,
                "status_breakdown": {},
                "category_breakdown": {},
                "turnover_rate": 0,
                "carrying_cost": 0,
                "reorder_alerts": 0,
                "top_categories": [],
            }
            low_stock = []

        logistics = LogisticsService()
        logistics_stats = logistics.get_shipment_stats()
        try:
            recent = logistics.get_shipments(page=1, page_size=5)
            recent_shipments = recent.get("shipments", [])
        except Exception:
            recent_shipments = []

        return {
            "success": True,
            "data": {
                "inventory": {"analytics": inv_analytics, "low_stock": low_stock},
                "logistics": {"stats": logistics_stats, "recent": recent_shipments},
                "forecast": forecast_signals,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"success": False, "error": str(e)})


@router.get("/stream")
async def dashboard_stream(business_id: int = Query(1, description="Business ID"), interval: int = Query(8, ge=2, le=60)):
    async def event_generator() -> AsyncGenerator[bytes, None]:
        engine = get_engine()
        SessionLocal = sessionmaker(bind=engine) if engine else None
        while True:
            try:
                inv_analytics = {}
                low_stock = []
                forecast_signals = {"next_festival": None, "current_season": None}
                if SessionLocal:
                    db = SessionLocal()
                    try:
                        inv = InventoryService(db)
                        inv_analytics = inv.get_analytics(business_id)
                        low_stock = inv.get_low_stock_items(business_id)[:10]
                        rows = db.execute(
                            select(DemandForecast).order_by(DemandForecast.created_at.desc()).limit(5)
                        ).scalars().all()
                        chosen = None
                        today0 = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                        for r in rows:
                            try:
                                blob = r.monthly_projections or {}
                                fe = _parse_iso_date((blob or {}).get("forecast_end"))
                                if fe and fe.date() >= today0.date():
                                    chosen = r
                                    break
                            except Exception:
                                continue
                        if not chosen and rows:
                            chosen = rows[0]
                        if chosen:
                            forecast_signals = _compute_forecast_signals(chosen)
                    finally:
                        db.close()
                logistics = LogisticsService()
                logistics_stats = logistics.get_shipment_stats()
                try:
                    recent = logistics.get_shipments(page=1, page_size=5)
                    recent_shipments = recent.get("shipments", [])
                except Exception:
                    recent_shipments = []
                payload = {
                    "ts": datetime.utcnow().isoformat() + "Z",
                    "inventory": {"analytics": inv_analytics, "low_stock": low_stock},
                    "logistics": {"stats": logistics_stats, "recent": recent_shipments},
                    "forecast": forecast_signals,
                }
                yield f"data: {json.dumps(payload, default=str)}\n\n".encode("utf-8")
            except Exception as e:
                err = {"error": str(e)}
                yield f"data: {json.dumps(err)}\n\n".encode("utf-8")
            await asyncio.sleep(interval)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
