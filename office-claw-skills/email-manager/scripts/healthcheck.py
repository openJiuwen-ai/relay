#!/usr/bin/env python3
"""
Integration checks for email-manager.
"""

import argparse
import json
import os
import sys

import imaplib
import smtplib

from imap_reader import load_config as load_imap_config
from smtp_sender import load_config as load_smtp_config


def _resolve_config_path(config_path):
    if config_path:
        return config_path
    return os.path.join(os.path.dirname(__file__), "..", "config.json")


def _result(name, success, detail=None, extra=None):
    payload = {"check": name, "success": success}
    if detail:
        payload["detail"] = detail
    if extra:
        payload.update(extra)
    return payload


def check_config(config_path=None):
    config_path = _resolve_config_path(config_path)
    checks = []
    try:
        smtp_config = load_smtp_config(config_path)
        checks.append(
            _result(
                "smtp_config",
                True,
                extra={
                    "host": smtp_config["smtp_host"],
                    "port": smtp_config["smtp_port"],
                    "user": smtp_config["smtp_user"],
                    "secret_ref": smtp_config["smtp_pass_ref"],
                },
            )
        )
    except Exception as exc:
        checks.append(_result("smtp_config", False, str(exc)))

    try:
        imap_config = load_imap_config(config_path)
        checks.append(
            _result(
                "imap_config",
                True,
                extra={
                    "host": imap_config["imap_host"],
                    "port": imap_config["imap_port"],
                    "user": imap_config["imap_user"],
                    "secret_ref": imap_config["imap_pass_ref"],
                },
            )
        )
    except Exception as exc:
        checks.append(_result("imap_config", False, str(exc)))

    return checks


def check_smtp(config_path=None):
    config = load_smtp_config(_resolve_config_path(config_path))
    server = smtplib.SMTP(config["smtp_host"], config["smtp_port"], timeout=30)
    try:
        server.starttls()
        server.login(config["smtp_user"], config["smtp_pass"])
        return _result(
            "smtp_login",
            True,
            extra={
                "host": config["smtp_host"],
                "port": config["smtp_port"],
                "user": config["smtp_user"],
            },
        )
    finally:
        try:
            server.quit()
        except Exception:
            pass


def check_imap(config_path=None, folder="INBOX", limit=1):
    config = load_imap_config(_resolve_config_path(config_path))
    mail = imaplib.IMAP4_SSL(config["imap_host"], config["imap_port"])
    try:
        mail.login(config["imap_user"], config["imap_pass"])
        status, _ = mail.select(folder)
        if status != "OK":
            raise RuntimeError(f"Failed to select folder: {folder}")
        status, messages = mail.search(None, "ALL")
        if status != "OK":
            raise RuntimeError("Failed to search mailbox.")
        email_ids = messages[0].split()
        sample_ids = [item.decode() for item in email_ids[-limit:]]
        return _result(
            "imap_login",
            True,
            extra={
                "host": config["imap_host"],
                "port": config["imap_port"],
                "user": config["imap_user"],
                "folder": folder,
                "message_count": len(email_ids),
                "sample_ids": sample_ids,
            },
        )
    finally:
        try:
            mail.close()
        except Exception:
            pass
        try:
            mail.logout()
        except Exception:
            pass


def run_all(config_path=None, folder="INBOX", limit=1):
    results = []
    results.extend(check_config(config_path))

    if all(item["success"] for item in results):
        try:
            results.append(check_smtp(config_path))
        except Exception as exc:
            results.append(_result("smtp_login", False, str(exc)))

        try:
            results.append(check_imap(config_path, folder=folder, limit=limit))
        except Exception as exc:
            results.append(_result("imap_login", False, str(exc)))

    overall = all(item["success"] for item in results)
    return {"success": overall, "checks": results}


def main():
    parser = argparse.ArgumentParser(
        description="Run email-manager integration checks."
    )
    subparsers = parser.add_subparsers(dest="command", help="Subcommands")

    all_parser = subparsers.add_parser("all", help="Run all checks")
    all_parser.add_argument("--config", help="Path to config.json")
    all_parser.add_argument("--folder", default="INBOX", help="Mailbox folder")
    all_parser.add_argument(
        "--limit", type=int, default=1, help="How many sample message ids to return"
    )

    config_parser = subparsers.add_parser("config", help="Validate config and refs")
    config_parser.add_argument("--config", help="Path to config.json")

    smtp_parser = subparsers.add_parser("smtp", help="Validate SMTP login")
    smtp_parser.add_argument("--config", help="Path to config.json")

    imap_parser = subparsers.add_parser("imap", help="Validate IMAP login")
    imap_parser.add_argument("--config", help="Path to config.json")
    imap_parser.add_argument("--folder", default="INBOX", help="Mailbox folder")
    imap_parser.add_argument(
        "--limit", type=int, default=1, help="How many sample message ids to return"
    )

    args = parser.parse_args()

    if args.command == "all":
        payload = run_all(args.config, folder=args.folder, limit=args.limit)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        sys.exit(0 if payload["success"] else 1)

    if args.command == "config":
        checks = check_config(args.config)
        success = all(item["success"] for item in checks)
        print(json.dumps({"success": success, "checks": checks}, ensure_ascii=False, indent=2))
        sys.exit(0 if success else 1)

    if args.command == "smtp":
        try:
            payload = check_smtp(args.config)
            print(json.dumps({"success": True, "checks": [payload]}, ensure_ascii=False, indent=2))
        except Exception as exc:
            print(
                json.dumps(
                    {"success": False, "checks": [_result("smtp_login", False, str(exc))]},
                    ensure_ascii=False,
                    indent=2,
                )
            )
            sys.exit(1)
        return

    if args.command == "imap":
        try:
            payload = check_imap(args.config, folder=args.folder, limit=args.limit)
            print(json.dumps({"success": True, "checks": [payload]}, ensure_ascii=False, indent=2))
        except Exception as exc:
            print(
                json.dumps(
                    {"success": False, "checks": [_result("imap_login", False, str(exc))]},
                    ensure_ascii=False,
                    indent=2,
                )
            )
            sys.exit(1)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
