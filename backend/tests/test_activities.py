"""
Bhoomi — Farm Activities & Notifications Test Suite (Prompt 7)
Covers §4 (farm_activities linked to crop cycles), Prompt 7 success criteria:
  - Full CRUD on farm activities
  - Strict owner-only access (cross-user access blocked with 403)
  - Quick-complete action updating completed_date
  - Notifications module: in-app listing, unread counter, read/read-all, deletion
  - Celery beat job: flagging due/overdue activities and dispatching reminders
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
import pytest


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #

def _create_user(app, phone: str, password: str = "Secure@1234",
                 name: str = "Farmer User") -> "User":
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
            user_type="farmer",
            verification_status="verified",
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
    assert resp.status_code == 200, f"Login failed: {resp.data}"
    csrf = resp.get_json().get("csrf_token", "")
    return resp, csrf


def _setup_crop_cycle(app, client, phone: str) -> tuple[str, str]:
    """Helper to set up Farm -> Plot -> CropCycle, returns (crop_cycle_id, csrf)."""
    _create_user(app, phone)
    _, csrf = _login(client, phone)

    f_resp = client.post(
        "/api/farms",
        json={"name": "Activity Test Farm"},
        headers={"X-CSRF-TOKEN": csrf},
        content_type="application/json",
    )
    farm_id = f_resp.get_json()["farm"]["id"]

    p_resp = client.post(
        f"/api/plots/farm/{farm_id}",
        json={"plot_name": "Plot 1", "area_acres": 2.5},
        headers={"X-CSRF-TOKEN": csrf},
        content_type="application/json",
    )
    plot_id = p_resp.get_json()["plot"]["id"]

    crops = client.get("/api/crops").get_json()["crops"]
    crop_id = crops[0]["id"]
    c_resp = client.post(
        f"/api/crop-cycles/plot/{plot_id}",
        json={"crop_catalog_id": crop_id, "sowing_date": str(date.today())},
        headers={"X-CSRF-TOKEN": csrf},
        content_type="application/json",
    )
    cycle_id = c_resp.get_json()["crop_cycle"]["id"]
    return cycle_id, csrf


# --------------------------------------------------------------------------- #
# 1. Farm Activities CRUD Tests                                               #
# --------------------------------------------------------------------------- #

class TestFarmActivitiesCRUD:
    """Tests for FarmActivity CRUD and completion."""

    def test_activity_lifecycle(self, app, client):
        phone = "9500000001"
        cycle_id, csrf = _setup_crop_cycle(app, client, phone)

        # 1. Log activity on crop cycle
        sched_date = str(date.today() + timedelta(days=5))
        c_resp = client.post(
            f"/api/activities/cycle/{cycle_id}",
            json={
                "activity_type": "irrigation",
                "scheduled_date": sched_date,
                "notes": "Drip irrigation first cycle",
            },
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert c_resp.status_code == 201
        activity = c_resp.get_json()["activity"]
        assert activity["activity_type"] == "irrigation"
        assert activity["scheduled_date"] == sched_date
        assert activity["is_completed"] is False
        activity_id = activity["id"]

        # 2. Get single activity
        get_resp = client.get(f"/api/activities/{activity_id}", headers={"X-CSRF-TOKEN": csrf})
        assert get_resp.status_code == 200
        assert get_resp.get_json()["activity"]["id"] == activity_id

        # 3. List activities for cycle
        list_cycle_resp = client.get(f"/api/activities/cycle/{cycle_id}", headers={"X-CSRF-TOKEN": csrf})
        assert list_cycle_resp.status_code == 200
        assert list_cycle_resp.get_json()["total"] == 1

        # 4. List my activities across all cycles
        my_acts_resp = client.get("/api/activities?is_completed=false", headers={"X-CSRF-TOKEN": csrf})
        assert my_acts_resp.status_code == 200
        assert my_acts_resp.get_json()["total"] >= 1

        # 5. Quick complete activity
        comp_date = str(date.today())
        comp_resp = client.post(
            f"/api/activities/{activity_id}/complete",
            json={"completed_date": comp_date, "notes": "Completed drip irrigation on time"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert comp_resp.status_code == 200
        completed_act = comp_resp.get_json()["activity"]
        assert completed_act["is_completed"] is True
        assert completed_act["completed_date"] == comp_date

        # 6. Verify now listed under completed
        done_resp = client.get("/api/activities?is_completed=true", headers={"X-CSRF-TOKEN": csrf})
        assert done_resp.status_code == 200
        assert any(a["id"] == activity_id for a in done_resp.get_json()["activities"])

        # 7. Delete activity
        del_resp = client.delete(f"/api/activities/{activity_id}", headers={"X-CSRF-TOKEN": csrf})
        assert del_resp.status_code == 200
        assert client.get(f"/api/activities/{activity_id}", headers={"X-CSRF-TOKEN": csrf}).status_code == 404


# --------------------------------------------------------------------------- #
# 2. Strict Owner-Only Access for Activities                                  #
# --------------------------------------------------------------------------- #

class TestActivityOwnerAccess:
    """Prompt 7: Cross-user access to farm activities must be blocked with 403."""

    def test_cross_user_activity_access_blocked(self, app, client):
        phone_a = "9500000010"
        phone_b = "9500000011"
        cycle_a_id, csrf_a = _setup_crop_cycle(app, client, phone_a)

        # Farmer A creates an activity
        c_resp = client.post(
            f"/api/activities/cycle/{cycle_a_id}",
            json={"activity_type": "fertilizer", "notes": "Urea application"},
            headers={"X-CSRF-TOKEN": csrf_a},
            content_type="application/json",
        )
        activity_a_id = c_resp.get_json()["activity"]["id"]

        # Farmer B logs in
        _create_user(app, phone_b, name="Farmer B")
        _, csrf_b = _login(client, phone_b)

        # 1. Farmer B cannot create activity on Farmer A's cycle (403)
        assert client.post(
            f"/api/activities/cycle/{cycle_a_id}",
            json={"activity_type": "pesticide"},
            headers={"X-CSRF-TOKEN": csrf_b},
            content_type="application/json",
        ).status_code == 403

        # 2. Farmer B cannot list activities for Farmer A's cycle (403)
        assert client.get(f"/api/activities/cycle/{cycle_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403

        # 3. Farmer B cannot view Farmer A's activity (403)
        assert client.get(f"/api/activities/{activity_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403

        # 4. Farmer B cannot update Farmer A's activity (403)
        assert client.patch(
            f"/api/activities/{activity_a_id}",
            json={"notes": "Hacked note"},
            headers={"X-CSRF-TOKEN": csrf_b},
            content_type="application/json",
        ).status_code == 403

        # 5. Farmer B cannot complete Farmer A's activity (403)
        assert client.post(
            f"/api/activities/{activity_a_id}/complete",
            json={},
            headers={"X-CSRF-TOKEN": csrf_b},
            content_type="application/json",
        ).status_code == 403

        # 6. Farmer B cannot delete Farmer A's activity (403)
        assert client.delete(f"/api/activities/{activity_a_id}", headers={"X-CSRF-TOKEN": csrf_b}).status_code == 403


# --------------------------------------------------------------------------- #
# 3. Notifications Module Tests                                               #
# --------------------------------------------------------------------------- #

class TestNotificationsModule:
    """Prompt 7: Minimal notifications module (in-app list + delivery channel)."""

    def test_notification_workflow(self, app, client):
        phone = "9500000020"
        user = _create_user(app, phone)
        _, csrf = _login(client, phone)

        # Send test notifications via service utility. External SMS is mocked;
        # tests must never contact a paid provider.
        from app.utils.notifications import send_notification
        from app.models.user import User
        from app.extensions import db
        from unittest.mock import patch
        with app.app_context():
            db.session.get(User, user.id).phone_number = "+919500000020"
            db.session.commit()
            n1 = send_notification(
                user_id=user.id,
                title="Irrigation Reminder",
                message="Wheat plot requires irrigation tomorrow.",
                notification_type="activity_reminder",
            )
            with patch("app.utils.notifications.boto3.client") as sns_client:
                n2 = send_notification(
                    user_id=user.id,
                    title="Weather Advisory",
                    message="Thunderstorm expected in Pune district.",
                    notification_type="weather_alert",
                    channel="sms",
                )
                sns_client.return_value.publish.assert_called_once()
            n1_id = str(n1.id)
            n2_id = str(n2.id)

        # 1. Unread count
        count_resp = client.get("/api/notifications/unread-count", headers={"X-CSRF-TOKEN": csrf})
        assert count_resp.status_code == 200
        assert count_resp.get_json()["unread_count"] == 2

        # 2. List notifications
        list_resp = client.get("/api/notifications", headers={"X-CSRF-TOKEN": csrf})
        assert list_resp.status_code == 200
        data = list_resp.get_json()
        assert data["total"] == 2

        # 3. Mark single notification as read
        read_resp = client.patch(f"/api/notifications/{n1_id}/read", headers={"X-CSRF-TOKEN": csrf})
        assert read_resp.status_code == 200
        assert read_resp.get_json()["notification"]["is_read"] is True

        # Check updated count is now 1
        count_resp2 = client.get("/api/notifications/unread-count", headers={"X-CSRF-TOKEN": csrf})
        assert count_resp2.get_json()["unread_count"] == 1

        # 4. Mark all as read
        read_all_resp = client.patch("/api/notifications/read-all", headers={"X-CSRF-TOKEN": csrf})
        assert read_all_resp.status_code == 200

        count_resp3 = client.get("/api/notifications/unread-count", headers={"X-CSRF-TOKEN": csrf})
        assert count_resp3.get_json()["unread_count"] == 0

        # 5. Delete notification
        del_resp = client.delete(f"/api/notifications/{n2_id}", headers={"X-CSRF-TOKEN": csrf})
        assert del_resp.status_code == 200
        assert client.get("/api/notifications", headers={"X-CSRF-TOKEN": csrf}).get_json()["total"] == 1


# --------------------------------------------------------------------------- #
# 4. Celery Beat Due Activity Reminders Job                                    #
# --------------------------------------------------------------------------- #

class TestActivityRemindersCeleryTask:
    """Prompt 7: Celery beat job flagging due/overdue activities and enqueuing notifications."""

    def test_check_due_activities_and_notify_task(self, app):
        from app.extensions import db
        from app.models.farm import Farm, Plot, CropCatalog, CropCycle, FarmActivity
        from app.models.notification import Notification
        from app.tasks.activities import check_due_activities_and_notify

        farmer = _create_user(app, "9500000030", name="Reminder Farmer")

        with app.app_context():
            # Setup Farm -> Plot -> CropCatalog -> CropCycle
            farm = Farm(id=uuid.uuid4(), user_id=farmer.id, name="Reminder Farm")
            plot = Plot(id=uuid.uuid4(), farm_id=farm.id, plot_name="Plot Z", area_acres=3.0)
            crop = CropCatalog.query.first()
            if not crop:
                crop = CropCatalog(id=uuid.uuid4(), crop_name="Test Millet", category="Millets")
                db.session.add(crop)

            cycle = CropCycle(
                id=uuid.uuid4(),
                plot_id=plot.id,
                crop_catalog_id=crop.id,
                sowing_date=date.today() - timedelta(days=20),
                status="active",
            )
            # 1. Overdue activity (yesterday)
            overdue_act = FarmActivity(
                id=uuid.uuid4(),
                crop_cycle_id=cycle.id,
                activity_type="pesticide",
                scheduled_date=date.today() - timedelta(days=1),
                completed_date=None,
            )
            # 2. Activity due today
            due_today_act = FarmActivity(
                id=uuid.uuid4(),
                crop_cycle_id=cycle.id,
                activity_type="fertilizer",
                scheduled_date=date.today(),
                completed_date=None,
            )
            # 3. Future activity (tomorrow — should NOT be notified)
            future_act = FarmActivity(
                id=uuid.uuid4(),
                crop_cycle_id=cycle.id,
                activity_type="irrigation",
                scheduled_date=date.today() + timedelta(days=2),
                completed_date=None,
            )
            # 4. Already completed activity (should NOT be notified)
            completed_act = FarmActivity(
                id=uuid.uuid4(),
                crop_cycle_id=cycle.id,
                activity_type="irrigation",
                scheduled_date=date.today() - timedelta(days=2),
                completed_date=date.today() - timedelta(days=2),
            )

            db.session.add_all([farm, plot, cycle, overdue_act, due_today_act, future_act, completed_act])
            db.session.commit()

            # Execute Celery task synchronously
            result = check_due_activities_and_notify()
            assert result["status"] == "success"
            assert result["reminders_dispatched"] >= 2

            # Verify in-app notifications generated for farmer
            notifs = Notification.query.filter_by(
                user_id=farmer.id,
                notification_type=Notification.TYPE_ACTIVITY_REMINDER,
            ).all()

            notif_act_ids = [n.data_json.get("activity_id") for n in notifs if n.data_json]
            assert str(overdue_act.id) in notif_act_ids
            assert str(due_today_act.id) in notif_act_ids
            assert str(future_act.id) not in notif_act_ids
            assert str(completed_act.id) not in notif_act_ids

            # Test Idempotency: Running task again today does NOT create duplicate notifications
            second_run = check_due_activities_and_notify()
            assert second_run["reminders_dispatched"] == 0
