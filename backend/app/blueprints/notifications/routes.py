"""
Bhoomi — Notifications Blueprint Routes
Exposes user notification endpoints per Prompt 7.
"""
from __future__ import annotations

import uuid
from flask import jsonify, request
from flask_jwt_extended import jwt_required, current_user

from app.extensions import db
from app.models.notification import Notification

from . import notifications_bp


@notifications_bp.route("", methods=["GET"])
@jwt_required()
def list_notifications():
    """
    GET /api/notifications
    Lists caller's notifications with pagination and is_read filtering.
    """
    is_read_param = request.args.get("is_read")
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    query = Notification.query.filter_by(user_id=current_user.id)
    if is_read_param is not None:
        is_read_bool = is_read_param.lower() in ("true", "1", "yes")
        query = query.filter_by(is_read=is_read_bool)

    query = query.order_by(Notification.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "notifications": [n.to_dict() for n in items],
        "total": total,
        "page": page,
        "per_page": per_page,
    }), 200


@notifications_bp.route("/unread-count", methods=["GET"])
@jwt_required()
def get_unread_count():
    """
    GET /api/notifications/unread-count
    Returns count of unread notifications for badge indicators.
    """
    count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({"unread_count": count}), 200


@notifications_bp.route("/<uuid:notif_id>/read", methods=["PATCH", "POST"])
@jwt_required()
def mark_notification_read(notif_id: uuid.UUID):
    """
    PATCH /api/notifications/<id>/read
    Marks a specific notification as read.
    """
    notif = Notification.query.get(notif_id)
    if not notif or notif.user_id != current_user.id:
        return jsonify({"error": "not_found", "message": "Notification not found."}), 404

    notif.mark_as_read()
    db.session.commit()

    return jsonify({"message": "Notification marked as read.", "notification": notif.to_dict()}), 200


@notifications_bp.route("/read-all", methods=["PATCH", "POST"])
@jwt_required()
def mark_all_notifications_read():
    """
    PATCH /api/notifications/read-all
    Marks all notifications for current user as read.
    """
    unread = Notification.query.filter_by(user_id=current_user.id, is_read=False).all()
    for n in unread:
        n.mark_as_read()

    db.session.commit()
    return jsonify({"message": f"{len(unread)} notifications marked as read.", "count": len(unread)}), 200


@notifications_bp.route("/<uuid:notif_id>", methods=["DELETE"])
@jwt_required()
def delete_notification(notif_id: uuid.UUID):
    """
    DELETE /api/notifications/<id>
    Deletes a notification belonging to the caller.
    """
    notif = Notification.query.get(notif_id)
    if not notif or notif.user_id != current_user.id:
        return jsonify({"error": "not_found", "message": "Notification not found."}), 404

    db.session.delete(notif)
    db.session.commit()
    return jsonify({"message": "Notification deleted."}), 200
