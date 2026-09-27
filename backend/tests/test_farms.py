"""
Bhoomi — Farms, Plots, Crop Cycles Test Suite (Prompt 6)
Covers §4 (Farms, Plots, Crop Catalog, Crop Cycles hierarchy, composite indexes, UUID PKs),
Prompt 6 success criteria:
  - Full CRUD on farms, plots, and crop_cycles
  - Read-only crop_catalog seeded with common crops
  - Strict owner-only access: cross-user read/write blocked (403) across all levels
  - Expected harvest date calculation from catalog duration
  - Cascade deletions: farm deletion removes plots and crop cycles
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
import pytest


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #

def _create_user(app, phone: str, password: str = "Secure@1234",
                 name: str = "Test Farmer", verification_status: str = "verified",
                 user_type: str = "farmer") -> "User":
    from app.extensions import db
    from app.models.user import User

    with app.app_context():
        existing = User.query.filter_by(phone_number=phone).first()
        if existing:
            db.session.refresh(existing)
            db.session.expunge(existing)
            return existing

        u = User(
            id=uuid.uuid4(),
            full_name=name,
            phone_number=phone,
            email=f"user_{phone}@bhoomi.test",
            platform_role="user",
            user_type=user_type,
            verification_status=verification_status,
            is_phone_verified=True,
            is_active=True,
        )
        u.set_password(password)
        db.session.add(u)
        db.session.commit()
        db.session.refresh(u)
        db.session.expunge(u)
        return u


def _login(client, identifier: str, password: str = "Secure@1234") -> tuple:
    resp = client.post(
        "/api/auth/login",
        json={"identifier": identifier, "password": password},
        content_type="application/json",
    )
    assert resp.status_code == 200, f"Login failed for {identifier}: {resp.data}"
    csrf = resp.get_json().get("csrf_token", "")
    return resp, csrf


# --------------------------------------------------------------------------- #
# 1. Crop Catalog Tests                                                       #
# --------------------------------------------------------------------------- #

class TestCropCatalog:
    """Tests for reference crop catalog endpoints."""

    def test_list_crops_auto_seeds(self, client):
        resp = client.get("/api/crops")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["total"] >= 15
        crop_names = [c["crop_name"] for c in data["crops"]]
        assert any("Wheat" in name for name in crop_names)
        assert any("Rice" in name for name in crop_names)
        assert any("Cotton" in name for name in crop_names)

    def test_filter_crops_by_category(self, client):
        resp = client.get("/api/crops?category=Cereals")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["total"] >= 2
        for crop in data["crops"]:
            assert crop["category"] == "Cereals"

    def test_get_single_crop(self, client):
        list_resp = client.get("/api/crops")
        crop_id = list_resp.get_json()["crops"][0]["id"]

        resp = client.get(f"/api/crops/{crop_id}")
        assert resp.status_code == 200
        assert resp.get_json()["crop"]["id"] == crop_id

    def test_get_nonexistent_crop_returns_404(self, client):
        resp = client.get(f"/api/crops/{uuid.uuid4()}")
        assert resp.status_code == 404


# --------------------------------------------------------------------------- #
# 2. Farms CRUD Tests                                                         #
# --------------------------------------------------------------------------- #

class TestFarmsCRUD:
    """Tests for Farm CRUD operations."""

    def test_create_and_list_farms(self, app, client):
        phone = "9600000001"
        _create_user(app, phone)
        _, csrf = _login(client, phone)

        # 1. Create farm
        create_resp = client.post(
            "/api/farms",
            json={
                "name": "Green Valley Estate",
                "latitude": 18.5204,
                "longitude": 73.8567,
                "soil_type": "Black Loam",
                "location_name": "Pune",
                "soil_type_source": "farmer_provided",
                "soil_region": "Pune district",
                "client_request_id": "175bd540-5da2-485c-9733-6683f478ae98",
            },
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert create_resp.status_code == 201
        farm = create_resp.get_json()["farm"]
        assert farm["name"] == "Green Valley Estate"
        assert farm["soil_type"] == "Black Loam"
        assert farm["location_name"] == "Pune"
        assert farm["soil_type_source"] == "farmer_provided"
        farm_id = farm["id"]

        duplicate_resp = client.post(
            "/api/farms",
            json={"name": "Duplicate retry", "client_request_id": "175bd540-5da2-485c-9733-6683f478ae98"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert duplicate_resp.status_code == 200
        assert duplicate_resp.get_json()["farm"]["id"] == farm_id

        # 2. List farms
        list_resp = client.get("/api/farms", headers={"X-CSRF-TOKEN": csrf})
        assert list_resp.status_code == 200
        data = list_resp.get_json()
        assert data["total"] == 1
        assert data["farms"][0]["id"] == farm_id
        assert data["farms"][0]["plots_count"] == 0

        # 3. Get single farm
        get_resp = client.get(f"/api/farms/{farm_id}", headers={"X-CSRF-TOKEN": csrf})
        assert get_resp.status_code == 200
        assert get_resp.get_json()["farm"]["id"] == farm_id

    def test_update_and_delete_farm(self, app, client):
        phone = "9600000002"
        _create_user(app, phone)
        _, csrf = _login(client, phone)

        # Create
        c_resp = client.post(
            "/api/farms",
            json={"name": "Old Farm Name"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        farm_id = c_resp.get_json()["farm"]["id"]

        # Update
        u_resp = client.patch(
            f"/api/farms/{farm_id}",
            json={"name": "New Golden Acres Farm", "soil_type": "Clay"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert u_resp.status_code == 200
        assert u_resp.get_json()["farm"]["name"] == "New Golden Acres Farm"
        assert u_resp.get_json()["farm"]["soil_type"] == "Clay"

        # Delete
        d_resp = client.delete(f"/api/farms/{farm_id}", headers={"X-CSRF-TOKEN": csrf})
        assert d_resp.status_code == 200

        # Verify 404 after delete
        get_resp = client.get(f"/api/farms/{farm_id}", headers={"X-CSRF-TOKEN": csrf})
        assert get_resp.status_code == 404


# --------------------------------------------------------------------------- #
# 3. Plots CRUD Tests                                                         #
# --------------------------------------------------------------------------- #

class TestPlotsCRUD:
    """Tests for Plot CRUD operations."""

    def test_plot_lifecycle(self, app, client):
        phone = "9600000010"
        _create_user(app, phone)
        _, csrf = _login(client, phone)

        # Setup farm
        f_resp = client.post(
            "/api/farms",
            json={"name": "Riverside Farm"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        farm_id = f_resp.get_json()["farm"]["id"]

        # 1. Create plot
        p_resp = client.post(
            f"/api/plots/farm/{farm_id}",
            json={"plot_name": "North Field", "area_acres": 4.5, "area_is_estimated": True, "client_request_id": "e9d9fa67-1d17-4b14-a6ae-58f9b92c982e"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert p_resp.status_code == 201
        plot = p_resp.get_json()["plot"]
        assert plot["plot_name"] == "North Field"
        assert plot["area_acres"] == 4.5
        assert plot["area_is_estimated"] is True
        plot_id = plot["id"]

        duplicate_plot = client.post(
            f"/api/plots/farm/{farm_id}",
            json={"plot_name": "Retry", "area_acres": 9, "client_request_id": "e9d9fa67-1d17-4b14-a6ae-58f9b92c982e"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert duplicate_plot.status_code == 200
        assert duplicate_plot.get_json()["plot"]["id"] == plot_id

        # 2. List plots
        list_resp = client.get(f"/api/plots/farm/{farm_id}", headers={"X-CSRF-TOKEN": csrf})
        assert list_resp.status_code == 200
        assert list_resp.get_json()["total"] == 1
        assert list_resp.get_json()["plots"][0]["id"] == plot_id

        # 3. Get single plot
        get_resp = client.get(f"/api/plots/{plot_id}", headers={"X-CSRF-TOKEN": csrf})
        assert get_resp.status_code == 200
        assert get_resp.get_json()["plot"]["id"] == plot_id

        # 4. Update plot
        u_resp = client.patch(
            f"/api/plots/{plot_id}",
            json={"plot_name": "North Field - Extended", "area_acres": 5.2},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert u_resp.status_code == 200
        assert u_resp.get_json()["plot"]["plot_name"] == "North Field - Extended"
        assert u_resp.get_json()["plot"]["area_acres"] == 5.2

        # 5. Delete plot
        d_resp = client.delete(f"/api/plots/{plot_id}", headers={"X-CSRF-TOKEN": csrf})
        assert d_resp.status_code == 200
        assert client.get(f"/api/plots/{plot_id}", headers={"X-CSRF-TOKEN": csrf}).status_code == 404


# --------------------------------------------------------------------------- #
# 4. Crop Cycles CRUD Tests                                                   #
# --------------------------------------------------------------------------- #

class TestCropCyclesCRUD:
    """Tests for CropCycle lifecycle, duration calculation, and status transitions."""

    def test_crop_cycle_lifecycle(self, app, client):
        phone = "9600000020"
        _create_user(app, phone)
        _, csrf = _login(client, phone)

        # Setup farm & plot
        f_resp = client.post(
            "/api/farms",
            json={"name": "Harvest Valley"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        farm_id = f_resp.get_json()["farm"]["id"]
        p_resp = client.post(
            f"/api/plots/farm/{farm_id}",
            json={"plot_name": "South Acre", "area_acres": 2.0},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        plot_id = p_resp.get_json()["plot"]["id"]

        # Get Wheat crop ID
        crops_resp = client.get("/api/crops")
        crops = crops_resp.get_json()["crops"]
        wheat = next(c for c in crops if "Wheat" in c["crop_name"])

        # 1. Create crop cycle (expected harvest date automatically calculated)
        sowing = str(date.today())
        same_day_harvest = client.post(
            f"/api/crop-cycles/plot/{plot_id}",
            json={
                "crop_catalog_id": wheat["id"],
                "sowing_date": sowing,
                "expected_harvest_date": sowing,
            },
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert same_day_harvest.status_code == 422

        c_resp = client.post(
            f"/api/crop-cycles/plot/{plot_id}",
            json={
                "crop_catalog_id": wheat["id"],
                "sowing_date": sowing,
            },
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert c_resp.status_code == 201
        cycle = c_resp.get_json()["crop_cycle"]
        assert cycle["status"] == "active"
        assert cycle["expected_harvest_date"] is not None
        cycle_id = cycle["id"]

        invalid_harvest_update = client.patch(
            f"/api/crop-cycles/{cycle_id}",
            json={"expected_harvest_date": sowing},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert invalid_harvest_update.status_code == 422

        # 2. Get single cycle
        get_resp = client.get(f"/api/crop-cycles/{cycle_id}", headers={"X-CSRF-TOKEN": csrf})
        assert get_resp.status_code == 200
        cycle_data = get_resp.get_json()["crop_cycle"]
        assert cycle_data["crop"]["crop_name"] == wheat["crop_name"]
        assert cycle_data["plot_name"] == "South Acre"

        # 3. List my crop cycles (across all plots)
        my_cycles_resp = client.get("/api/crop-cycles?status=active", headers={"X-CSRF-TOKEN": csrf})
        assert my_cycles_resp.status_code == 200
        assert my_cycles_resp.get_json()["total"] >= 1

        # 4. Harvest the crop cycle
        harvest_date = str(date.today())
        u_resp = client.patch(
            f"/api/crop-cycles/{cycle_id}",
            json={"status": "harvested", "actual_harvest_date": harvest_date},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert u_resp.status_code == 200
        updated = u_resp.get_json()["crop_cycle"]
        assert updated["status"] == "harvested"
        assert updated["actual_harvest_date"] == harvest_date

        # 5. Delete crop cycle
        del_resp = client.delete(f"/api/crop-cycles/{cycle_id}", headers={"X-CSRF-TOKEN": csrf})
        assert del_resp.status_code == 200
        assert client.get(f"/api/crop-cycles/{cycle_id}", headers={"X-CSRF-TOKEN": csrf}).status_code == 404


# --------------------------------------------------------------------------- #
# 5. Strict Owner-Only Access Controls (Cross-User Blocked)                   #
# --------------------------------------------------------------------------- #

class TestStrictOwnerOnlyAccess:
    """Prompt 6 requirement: strict owner-only write access (test cross-user access is blocked)."""

    def test_user_cannot_access_or_modify_another_users_farm_plot_or_cycle(self, app, client):
        phone_a = "9600000031"
        phone_b = "9600000032"
        user_a = _create_user(app, phone_a, name="Farmer A")
        user_b = _create_user(app, phone_b, name="Farmer B")

        # User A logs in and creates Farm -> Plot -> CropCycle
        _, csrf_a = _login(client, phone_a)
        f_resp = client.post(
            "/api/farms",
            json={"name": "Farmer A's Private Land"},
            headers={"X-CSRF-TOKEN": csrf_a},
            content_type="application/json",
        )
        farm_a_id = f_resp.get_json()["farm"]["id"]

        p_resp = client.post(
            f"/api/plots/farm/{farm_a_id}",
            json={"plot_name": "Plot Alpha", "area_acres": 3.0},
            headers={"X-CSRF-TOKEN": csrf_a},
            content_type="application/json",
        )
        plot_a_id = p_resp.get_json()["plot"]["id"]

        crops = client.get("/api/crops").get_json()["crops"]
        crop_id = crops[0]["id"]
        c_resp = client.post(
            f"/api/crop-cycles/plot/{plot_a_id}",
            json={"crop_catalog_id": crop_id, "sowing_date": str(date.today())},
            headers={"X-CSRF-TOKEN": csrf_a},
            content_type="application/json",
        )
        cycle_a_id = c_resp.get_json()["crop_cycle"]["id"]

        # Now User B logs in and attempts unauthorized operations
        _, csrf_b = _login(client, phone_b)

        # 1. User B cannot view User A's farm (403)
        assert client.get(f"/api/farms/{farm_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403

        # 2. User B cannot update User A's farm (403)
        assert client.patch(
            f"/api/farms/{farm_a_id}",
            json={"name": "Hacked Farm"},
            headers={"X-CSRF-TOKEN": csrf_b},
            content_type="application/json",
        ).status_code == 403

        # 3. User B cannot delete User A's farm (403)
        assert client.delete(f"/api/farms/{farm_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403

        # 4. User B cannot create plot in User A's farm (403)
        assert client.post(
            f"/api/plots/farm/{farm_a_id}",
            json={"plot_name": "Intruder Plot", "area_acres": 1.0},
            headers={"X-CSRF-TOKEN": csrf_b},
            content_type="application/json",
        ).status_code == 403

        # 5. User B cannot list plots in User A's farm (403)
        assert client.get(f"/api/plots/farm/{farm_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403

        # 6. User B cannot view User A's plot (403)
        assert client.get(f"/api/plots/{plot_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403

        # 7. User B cannot update User A's plot (403)
        assert client.patch(
            f"/api/plots/{plot_a_id}",
            json={"plot_name": "Tampered Plot"},
            headers={"X-CSRF-TOKEN": csrf_b},
            content_type="application/json",
        ).status_code == 403

        # 8. User B cannot delete User A's plot (403)
        assert client.delete(f"/api/plots/{plot_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403

        # 9. User B cannot create crop cycle on User A's plot (403)
        assert client.post(
            f"/api/crop-cycles/plot/{plot_a_id}",
            json={"crop_catalog_id": crop_id, "sowing_date": str(date.today())},
            headers={"X-CSRF-TOKEN": csrf_b},
            content_type="application/json",
        ).status_code == 403

        # 10. User B cannot view User A's crop cycle (403)
        assert client.get(f"/api/crop-cycles/{cycle_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403

        # 11. User B cannot update User A's crop cycle (403)
        assert client.patch(
            f"/api/crop-cycles/{cycle_a_id}",
            json={"status": "failed"},
            headers={"X-CSRF-TOKEN": csrf_b},
            content_type="application/json",
        ).status_code == 403

        # 12. User B cannot delete User A's crop cycle (403)
        assert client.delete(f"/api/crop-cycles/{cycle_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403

    def test_unverified_farmer_cannot_start_crop_cycle(self, app, client):
        phone = "9600000051"
        _create_user(app, phone, verification_status="unverified")
        _, csrf = _login(client, phone)
        farm = client.post("/api/farms", json={"name": "Unverified Farm"}, headers={"X-CSRF-TOKEN": csrf})
        farm_id = farm.get_json()["farm"]["id"]
        plot = client.post(
            f"/api/plots/farm/{farm_id}",
            json={"plot_name": "Plot", "area_acres": 1},
            headers={"X-CSRF-TOKEN": csrf},
        )
        plot_id = plot.get_json()["plot"]["id"]
        crop = client.get("/api/crops").get_json()["crops"][0]
        response = client.post(
            f"/api/crop-cycles/plot/{plot_id}",
            json={"crop_catalog_id": crop["id"], "sowing_date": str(date.today())},
            headers={"X-CSRF-TOKEN": csrf},
        )
        assert response.status_code == 403
        assert response.get_json()["error"] == "verification_required"


# --------------------------------------------------------------------------- #
# 6. Cascade Deletion Tests                                                   #
# --------------------------------------------------------------------------- #

class TestCascadeDeletions:
    """Verifies relational integrity: deleting a farm deletes plots and cycles."""

    def test_deleting_farm_cascades_to_plots_and_crop_cycles(self, app, client):
        phone = "9600000040"
        _create_user(app, phone)
        _, csrf = _login(client, phone)

        # 1. Create Farm -> Plot -> CropCycle
        f_resp = client.post(
            "/api/farms",
            json={"name": "Cascade Test Farm"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        farm_id = f_resp.get_json()["farm"]["id"]

        p_resp = client.post(
            f"/api/plots/farm/{farm_id}",
            json={"plot_name": "Plot 1", "area_acres": 2.0},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        plot_id = p_resp.get_json()["plot"]["id"]

        crop_id = client.get("/api/crops").get_json()["crops"][0]["id"]
        c_resp = client.post(
            f"/api/crop-cycles/plot/{plot_id}",
            json={"crop_catalog_id": crop_id, "sowing_date": str(date.today())},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        cycle_id = c_resp.get_json()["crop_cycle"]["id"]

        # Verify all 3 exist in DB
        from app.models.farm import Farm, Plot, CropCycle
        with app.app_context():
            assert Farm.query.get(uuid.UUID(farm_id)) is not None
            assert Plot.query.get(uuid.UUID(plot_id)) is not None
            assert CropCycle.query.get(uuid.UUID(cycle_id)) is not None

        # Delete farm
        del_resp = client.delete(f"/api/farms/{farm_id}", headers={"X-CSRF-TOKEN": csrf})
        assert del_resp.status_code == 200

        # Verify all 3 were cascade-deleted
        with app.app_context():
            assert Farm.query.get(uuid.UUID(farm_id)) is None
            assert Plot.query.get(uuid.UUID(plot_id)) is None
            assert CropCycle.query.get(uuid.UUID(cycle_id)) is None


def test_buyer_cannot_access_owned_farm_domain_resources(app, client):
    """Domain type is checked separately from authentication and ownership."""
    from app.extensions import db
    from app.models.user import User

    phone = "9600001099"
    user = _create_user(app, phone)
    _, csrf = _login(client, phone)
    headers = {"X-CSRF-TOKEN": csrf, "Content-Type": "application/json"}

    farm_response = client.post("/api/farms", json={"name": "Owned Farm"}, headers=headers)
    assert farm_response.status_code == 201
    farm_id = farm_response.get_json()["farm"]["id"]
    plot_response = client.post(
        f"/api/plots/farm/{farm_id}",
        json={"plot_name": "Owned Plot", "area_acres": 1.5},
        headers=headers,
    )
    assert plot_response.status_code == 201
    plot_id = plot_response.get_json()["plot"]["id"]
    crop_id = client.get("/api/crops").get_json()["crops"][0]["id"]
    cycle_response = client.post(
        f"/api/crop-cycles/plot/{plot_id}",
        json={"crop_catalog_id": crop_id, "sowing_date": str(date.today())},
        headers=headers,
    )
    assert cycle_response.status_code == 201
    cycle_id = cycle_response.get_json()["crop_cycle"]["id"]
    activity_response = client.post(
        f"/api/activities/cycle/{cycle_id}",
        json={"activity_type": "irrigation"},
        headers=headers,
    )
    assert activity_response.status_code == 201
    activity_id = activity_response.get_json()["activity"]["id"]

    with app.app_context():
        db.session.get(User, user.id).user_type = "buyer"
        db.session.commit()

    assert client.get("/api/farms").status_code == 403
    assert client.get(f"/api/farms/{farm_id}").status_code == 403
    assert client.post("/api/farms", json={"name": "Not Allowed"}, headers=headers).status_code == 403
    assert client.get(f"/api/plots/{plot_id}").status_code == 403
    assert client.get(f"/api/crop-cycles/{cycle_id}").status_code == 403
    assert client.get(f"/api/activities/{activity_id}").status_code == 403
