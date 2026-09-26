"""
Bhoomi — CLI commands
Registers all Flask CLI commands with the application.
"""
from __future__ import annotations

import sys

import click
from flask import Flask


def register_commands(app: Flask) -> None:
    """Register all CLI commands on the Flask app."""

    @app.cli.command("create-super-admin")
    @click.option("--name", prompt=True, help="Full name of the Super Admin")
    @click.option("--email", prompt=True, help="Email address")
    @click.option("--phone", prompt=True, help="Phone number (unique)")
    @click.option(
        "--password",
        prompt=True,
        hide_input=True,
        confirmation_prompt=True,
        help="Password (min 8 characters)",
    )
    def create_super_admin(name: str, email: str, phone: str, password: str) -> None:
        """
        Bootstrap the first Super Admin account (§7.6).

        Idempotent-guarded: refuses to run if any super_admin already exists.
        The account is created with is_phone_verified=True and is_active=True.
        """
        from app.extensions import db
        from app.models.user import User

        if len(password) < 8:
            click.secho("❌  Password must be at least 8 characters.", fg="red", err=True)
            sys.exit(1)

        existing = User.query.filter_by(platform_role="super_admin").first()
        if existing:
            click.secho(
                f"❌  A Super Admin already exists "
                f"({existing.phone_number} / {existing.email}). "
                "Aborting to prevent privilege escalation.",
                fg="red",
                err=True,
            )
            sys.exit(1)

        # Duplicate phone / email guard
        if User.query.filter_by(phone_number=phone).first():
            click.secho(
                f"❌  Phone number '{phone}' is already registered.", fg="red", err=True
            )
            sys.exit(1)

        if email and User.query.filter_by(email=email).first():
            click.secho(
                f"❌  Email '{email}' is already registered.", fg="red", err=True
            )
            sys.exit(1)

        super_admin = User(
            full_name=name,
            phone_number=phone,
            email=email or None,
            platform_role=User.PLATFORM_ROLE_SUPER_ADMIN,
            user_type=None,          # Admins have no domain user_type
            is_phone_verified=True,
            is_active=True,
        )
        super_admin.set_password(password)

        db.session.add(super_admin)
        db.session.commit()

        click.secho(
            f"✅  Super Admin created successfully!\n"
            f"    ID    : {super_admin.id}\n"
            f"    Name  : {super_admin.full_name}\n"
            f"    Phone : {super_admin.phone_number}\n"
            f"    Email : {super_admin.email}",
            fg="green",
        )
