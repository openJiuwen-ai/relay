#!/usr/bin/env python3
"""
SMTP mail sender backed by Windows Credential Manager secret refs.
"""

import argparse
import json
import os
import pathlib
import smtplib
import sys
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from wincred_store import resolve_secret_ref

_BLOCKED_PREFIXES = [
    "/etc/",
    "/proc/",
    "/sys/",
    "/dev/",
    "/root/",
    "C:\\Windows\\",
    "C:\\ProgramData\\",
    "\\Windows\\",
    "\\ProgramData\\",
]

_BLOCKED_NAMES = {
    "hosts",
    "ntuser.dat",
    "ntuser.ini",
    "passwd",
    "sam",
    "security",
    "shadow",
    "system",
}


def _safe_attachment(file_path: str) -> pathlib.Path:
    path = pathlib.Path(file_path).resolve()
    if not path.is_file():
        raise ValueError(f"Attachment is not a file: {file_path}")

    if path.name.lower() in _BLOCKED_NAMES:
        raise ValueError(f"Blocked sensitive attachment name: {path.name}")

    path_str = str(path)
    for prefix in _BLOCKED_PREFIXES:
        if path_str.lower().startswith(prefix.lower()):
            raise ValueError(f"Blocked system path attachment: {file_path}")

    return path


def _load_env_config() -> dict:
    return {
        "smtp_host": os.environ.get("SMTP_HOST", "smtp.qq.com"),
        "smtp_port": int(os.environ.get("SMTP_PORT", 587)),
        "smtp_user": os.environ.get("SMTP_USER", ""),
        "smtp_pass_ref": os.environ.get("SMTP_PASS_REF", ""),
        "smtp_from": os.environ.get("SMTP_FROM", os.environ.get("SMTP_USER", "")),
    }


def _normalize_config(config: dict) -> dict:
    if "smtp_pass" in config:
        raise ValueError(
            "Plaintext smtp_pass is not supported. Use smtp_pass_ref only."
        )

    secret_ref = config.get("smtp_pass_ref", "")
    if not secret_ref:
        raise ValueError(
            "Missing smtp_pass_ref. Store the SMTP secret in Windows Credential "
            "Manager and put the returned ref in config."
        )

    smtp_user = config.get("smtp_user", "").strip()
    if not smtp_user:
        raise ValueError("Missing smtp_user.")

    smtp_host = config.get("smtp_host", "").strip()
    if not smtp_host:
        raise ValueError("Missing smtp_host.")

    smtp_from = config.get("smtp_from", "").strip() or smtp_user

    return {
        "smtp_host": smtp_host,
        "smtp_port": int(config.get("smtp_port", 587)),
        "smtp_user": smtp_user,
        "smtp_pass_ref": secret_ref,
        "smtp_from": smtp_from,
        "smtp_pass": resolve_secret_ref(secret_ref),
    }


def load_config(config_path=None):
    if config_path is None:
        config_path = os.path.join(os.path.dirname(__file__), "..", "config.json")

    if not os.path.exists(config_path):
        config = _load_env_config()
    else:
        with open(config_path, "r", encoding="utf-8-sig") as handle:
            config = json.load(handle)

    return _normalize_config(config)


def send_email(
    to,
    subject,
    body,
    html=False,
    attachments=None,
    cc=None,
    bcc=None,
    config_path=None,
):
    config = load_config(config_path)

    msg = MIMEMultipart("alternative")
    msg["From"] = config["smtp_from"]
    msg["To"] = to
    msg["Subject"] = subject

    if cc:
        msg["Cc"] = cc
    if bcc:
        msg["Bcc"] = bcc

    if html:
        msg.attach(MIMEText(body, "html", "utf-8"))
    else:
        msg.attach(MIMEText(body, "plain", "utf-8"))

    if attachments:
        for file_path in attachments:
            try:
                safe_path = _safe_attachment(file_path)
                with open(safe_path, "rb") as handle:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(handle.read())
                encoders.encode_base64(part)
                part.add_header(
                    "Content-Disposition",
                    f"attachment; filename={safe_path.name}",
                )
                msg.attach(part)
            except ValueError as exc:
                print(f"Attachment skipped: {exc}", file=sys.stderr)

    try:
        server = smtplib.SMTP(config["smtp_host"], config["smtp_port"], timeout=30)
        server.starttls()
        server.login(config["smtp_user"], config["smtp_pass"])

        recipients = [to]
        if cc:
            recipients.extend(item.strip() for item in cc.split(",") if item.strip())
        if bcc:
            recipients.extend(item.strip() for item in bcc.split(",") if item.strip())

        server.sendmail(config["smtp_user"], recipients, msg.as_string())
        server.quit()
        return {"success": True, "message": "Email sent successfully."}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def test_connection(config_path=None):
    config = load_config(config_path)
    server = smtplib.SMTP(config["smtp_host"], config["smtp_port"], timeout=30)
    try:
        server.starttls()
        server.login(config["smtp_user"], config["smtp_pass"])
    finally:
        try:
            server.quit()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(
        description="SMTP mail sender using Windows Credential Manager."
    )
    subparsers = parser.add_subparsers(dest="command", help="Subcommands")

    send_parser = subparsers.add_parser("send", help="Send an email")
    send_parser.add_argument("--to", required=True, help="Recipient")
    send_parser.add_argument("--subject", required=True, help="Subject")
    send_parser.add_argument("--body", required=True, help="Body")
    send_parser.add_argument("--html", action="store_true", help="Send as HTML")
    send_parser.add_argument("--attach", action="append", help="Attachment path")
    send_parser.add_argument("--cc", help="CC recipients, comma separated")
    send_parser.add_argument("--bcc", help="BCC recipients, comma separated")
    send_parser.add_argument("--config", help="Path to config.json")

    test_parser = subparsers.add_parser("test", help="Test SMTP connectivity")
    test_parser.add_argument("--config", help="Path to config.json")

    args = parser.parse_args()

    if args.command == "send":
        result = send_email(
            to=args.to,
            subject=args.subject,
            body=args.body,
            html=args.html,
            attachments=args.attach,
            cc=args.cc,
            bcc=args.bcc,
            config_path=args.config,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if result["success"] else 1)

    if args.command == "test":
        try:
            test_connection(args.config)
            print(
                json.dumps(
                    {"success": True, "message": "SMTP connection succeeded."},
                    ensure_ascii=False,
                    indent=2,
                )
            )
        except Exception as exc:
            print(
                json.dumps(
                    {"success": False, "error": str(exc)},
                    ensure_ascii=False,
                    indent=2,
                )
            )
            sys.exit(1)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
