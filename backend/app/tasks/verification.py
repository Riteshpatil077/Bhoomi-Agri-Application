"""
Bhoomi — Verification Retention Purge Celery Task
Implements automated document purge for expired verification photos per §5:
"raw images purged automatically (docs_purge_at, a Celery beat job) a fixed
period after a decision — keep only the decision, reviewer id, timestamp once
retention expires."
"""
from __future__ import annotations

import logging
from typing import Any

from app.celery_app import celery
from app.extensions import db
from app.models.base import utc_now
from app.models.verification import FarmerVerification
from app.models.audit import AuditLog
from app.utils.storage import PrivateVerificationStorage

logger = logging.getLogger(__name__)


@celery.task(name="app.tasks.verification.purge_expired_verification_docs")
def purge_expired_verification_docs() -> dict[str, Any]:
    """
    Periodic job that purges verification documents where docs_purge_at <= now.
    Removes raw photo objects from the private bucket and marks keys as [PURGED].
    """
    now = utc_now()
    expired = (
        FarmerVerification.query
        .filter(
            FarmerVerification.docs_purge_at.isnot(None),
            FarmerVerification.docs_purge_at <= now,
            FarmerVerification.selfie_photo_key != "[PURGED]",
        )
        .all()
    )

    purged_count = 0
    for record in expired:
        # Delete from private object storage (§5)
        if record.selfie_photo_key and record.selfie_photo_key != "[PURGED]":
            PrivateVerificationStorage.delete_object(record.selfie_photo_key)
        if record.land_photo_key and record.land_photo_key != "[PURGED]":
            PrivateVerificationStorage.delete_object(record.land_photo_key)

        record.selfie_photo_key = "[PURGED]"
        record.land_photo_key = "[PURGED]"

        # Create system audit entry
        audit_entry = AuditLog(
            actor_user_id=None,  # system task
            action="purge_expired_verification_docs",
            resource_type="farmer_verification",
            resource_id=str(record.id),
            reason="Automated retention policy document purge per §5",
            metadata_redacted={
                "target_user_id": str(record.user_id),
                "docs_purge_at": record.docs_purge_at.isoformat() if record.docs_purge_at else None,
            },
        )
        db.session.add(audit_entry)
        purged_count += 1

    if purged_count > 0:
        db.session.commit()
        logger.info("Purged %d expired farmer verification document sets.", purged_count)

    return {
        "status": "success",
        "purged_records": purged_count,
        "timestamp": now.isoformat(),
    }
