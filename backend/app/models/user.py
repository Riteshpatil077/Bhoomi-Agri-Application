"""
Bhoomi — User Model
Implements User entity with split user_type and platform_role fields per §4 & §7.
"""
from __future__ import annotations

import uuid
from typing import Any

import bcrypt
from sqlalchemy import func
from app.extensions import db
from .base import UUIDPrimaryKeyMixin, TimestampMixin


class User(db.Model, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    User model representing all platform actors.
    - user_type: domain/business role (farmer, buyer, expert, provider)
    - platform_role: privilege tier (user, admin, super_admin)
    """
    __tablename__ = "users"

    # Permitted values
    USER_TYPE_FARMER = "farmer"
    USER_TYPE_BUYER = "buyer"
    USER_TYPE_EXPERT = "expert"
    USER_TYPE_PROVIDER = "provider"
    USER_TYPES = (USER_TYPE_FARMER, USER_TYPE_BUYER, USER_TYPE_EXPERT, USER_TYPE_PROVIDER)

    PLATFORM_ROLE_USER = "user"
    PLATFORM_ROLE_ADMIN = "admin"
    PLATFORM_ROLE_SUPER_ADMIN = "super_admin"
    PLATFORM_ROLES = (PLATFORM_ROLE_USER, PLATFORM_ROLE_ADMIN, PLATFORM_ROLE_SUPER_ADMIN)

    VERIFICATION_STATUS_UNVERIFIED = "unverified"
    VERIFICATION_STATUS_PENDING = "pending"
    VERIFICATION_STATUS_VERIFIED = "verified"
    VERIFICATION_STATUS_REJECTED = "rejected"
    VERIFICATION_STATUSES = (
        VERIFICATION_STATUS_UNVERIFIED,
        VERIFICATION_STATUS_PENDING,
        VERIFICATION_STATUS_VERIFIED,
        VERIFICATION_STATUS_REJECTED,
    )

    full_name = db.Column(db.String(255), nullable=False)
    phone_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)

    # Domain role vs privilege tier split (§4, §7)
    user_type = db.Column(db.String(50), nullable=True, default=USER_TYPE_FARMER)
    platform_role = db.Column(db.String(50), nullable=False, default=PLATFORM_ROLE_USER, index=True)

    preferred_language = db.Column(db.String(10), nullable=False, default="en")
    is_phone_verified = db.Column(db.Boolean, nullable=False, default=False)
    verification_status = db.Column(
        db.String(50),
        nullable=False,
        default=VERIFICATION_STATUS_UNVERIFIED,
        index=True,
    )
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)

    # Relationships
    farms = db.relationship("Farm", back_populates="user", cascade="all, delete-orphan", lazy="dynamic")
    farmer_verifications = db.relationship(
        "FarmerVerification",
        back_populates="user",
        foreign_keys="FarmerVerification.user_id",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )
    permission_grants = db.relationship(
        "AdminPermissionGrant",
        back_populates="admin_user",
        foreign_keys="AdminPermissionGrant.admin_user_id",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )
    refresh_tokens = db.relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    def set_password(self, password: str) -> None:
        """Hash and store password using bcrypt."""
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    def check_password(self, password: str) -> bool:
        """Verify password against stored bcrypt hash."""
        if not self.password_hash:
            return False
        return bcrypt.checkpw(password.encode("utf-8"), self.password_hash.encode("utf-8"))

    @property
    def is_super_admin(self) -> bool:
        return self.platform_role == self.PLATFORM_ROLE_SUPER_ADMIN

    @property
    def is_admin(self) -> bool:
        return self.platform_role in (self.PLATFORM_ROLE_ADMIN, self.PLATFORM_ROLE_SUPER_ADMIN)

    @property
    def is_farmer(self) -> bool:
        return self.user_type == self.USER_TYPE_FARMER

    def to_dict(self, include_private: bool = False) -> dict[str, Any]:
        """Serialize user to dict, sanitizing sensitive fields."""
        data = {
            "id": str(self.id),
            "full_name": self.full_name,
            "phone_number": self.phone_number,
            "email": self.email,
            "user_type": self.user_type,
            "platform_role": self.platform_role,
            "preferred_language": self.preferred_language,
            "is_phone_verified": self.is_phone_verified,
            "verification_status": self.verification_status,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        return data

    def __repr__(self) -> str:
        return f"<User {self.id} {self.phone_number} role={self.platform_role} type={self.user_type}>"
