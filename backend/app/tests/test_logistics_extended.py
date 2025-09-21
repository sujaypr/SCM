import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.fixture
def sample_shipment():
    return {"destination": "Mumbai", "origin": "Bangalore", "items_count": 5, "weight": 12.5}


def test_shipments_pagination(sample_shipment):
    # create a few shipments
    for _ in range(3):
        r = client.post("/api/logistics/shipments", json=sample_shipment)
        assert r.status_code == 200
    r = client.get("/api/logistics/shipments?page=1&page_size=2")
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert "meta" in data and data["meta"]["page"] == 1
    assert len(data["shipments"]) <= 2


def test_provider_comparison(sample_shipment):
    client.post("/api/logistics/shipments", json=sample_shipment)
    r = client.post("/api/logistics/shipments/providers", json={"origin": "Bangalore", "destination": "Delhi"})
    assert r.status_code == 200
    payload = r.json()
    assert payload["success"] is True
    assert "providers" in payload and len(payload["providers"]) > 0
    first = payload["providers"][0]
    assert "score" in first and "cost_breakdown" in first


def test_mode_recommendation():
    r = client.get("/api/logistics/modes/recommend?origin=Bangalore&destination=Delhi")
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert "recommendation" in data and "recommended_mode" in data["recommendation"]


def test_events_endpoint(sample_shipment):
    create = client.post("/api/logistics/shipments", json=sample_shipment)
    shipment_id = create.json()["shipment"]["id"]
    # update status
    update = client.put(f"/api/logistics/shipments/{shipment_id}/status", json={"status": "In Transit"})
    assert update.status_code == 200
    events = client.get(f"/api/logistics/shipments/{shipment_id}/events")
    assert events.status_code == 200
    ev_payload = events.json()
    assert ev_payload["success"] is True
    assert ev_payload["count"] >= 2  # Processing + In Transit


# Removed: precise analysis route test (endpoint deprecated)
