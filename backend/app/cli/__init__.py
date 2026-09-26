"""
Bhoomi — CLI commands
Registers all Flask CLI commands with the application.
The `create-super-admin` command is fully implemented in Prompt 4 per §7.6.
"""
from __future__ import annotations

import click
from flask import Flask


def register_commands(app: Flask) -> None:
    """Register all CLI commands on the Flask app."""

    @app.cli.command("create-super-admin")
    @click.option("--name", prompt=True, help="Full name of the Super Admin")
    @click.option("--email", prompt=True, help="Email address")
    @click.option("--phone", prompt=True, help="Phone number")
    @click.option(
        "--password",
        prompt=True,
        hide_input=True,
        confirmation_prompt=True,
        help="Password",
    )
    def create_super_admin(name: str, email: str, phone: str, password: str) -> None:
        """
        Bootstrap the first Super Admin account (§7.6).
        Idempotent-guarded: refuses to run if any super_admin already exists.
        Full implementation follows in Prompt 4.
        """
        click.echo(
            "⚠️  create-super-admin command not yet fully implemented — "
            "will be completed in Prompt 4 per §7.6."
        )
