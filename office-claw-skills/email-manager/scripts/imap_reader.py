#!/usr/bin/env python3
"""
IMAP mail reader backed by Windows Credential Manager secret refs.
"""

import argparse
import email
from email.header import decode_header
import imaplib
import json
import os

from wincred_store import resolve_secret_ref


def _load_env_config() -> dict:
    return {
        "imap_host": os.environ.get("IMAP_HOST", "imap.qq.com"),
        "imap_port": int(os.environ.get("IMAP_PORT", 993)),
        "imap_user": os.environ.get("IMAP_USER", ""),
        "imap_pass_ref": os.environ.get("IMAP_PASS_REF", ""),
    }


def _normalize_config(config: dict) -> dict:
    if "imap_pass" in config:
        raise ValueError(
            "Plaintext imap_pass is not supported. Use imap_pass_ref only."
        )

    secret_ref = config.get("imap_pass_ref", "")
    if not secret_ref:
        raise ValueError(
            "Missing imap_pass_ref. Store the IMAP secret in Windows Credential "
            "Manager and put the returned ref in config."
        )

    imap_user = config.get("imap_user", "").strip()
    if not imap_user:
        raise ValueError("Missing imap_user.")

    imap_host = config.get("imap_host", "").strip()
    if not imap_host:
        raise ValueError("Missing imap_host.")

    return {
        "imap_host": imap_host,
        "imap_port": int(config.get("imap_port", 993)),
        "imap_user": imap_user,
        "imap_pass_ref": secret_ref,
        "imap_pass": resolve_secret_ref(secret_ref),
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


def decode_str(value):
    if value is None:
        return ""
    decoded = []
    for part, charset in decode_header(value):
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded)


def get_email_body(message):
    body = ""
    if message.is_multipart():
        for part in message.walk():
            if part.get_content_type() == "text/plain":
                try:
                    payload = part.get_payload(decode=True)
                    charset = part.get_content_charset() or "utf-8"
                    body = payload.decode(charset, errors="replace")
                    break
                except (AttributeError, TypeError, UnicodeDecodeError):
                    pass
    else:
        try:
            payload = message.get_payload(decode=True)
            charset = message.get_content_charset() or "utf-8"
            body = payload.decode(charset, errors="replace")
        except (AttributeError, TypeError, UnicodeDecodeError):
            pass
    return body


def connect_imap(config):
    mail = imaplib.IMAP4_SSL(config["imap_host"], config["imap_port"])
    mail.login(config["imap_user"], config["imap_pass"])
    return mail


def list_emails(limit=10, folder="INBOX", unread_only=False, config_path=None):
    config = load_config(config_path)
    mail = connect_imap(config)
    try:
        mail.select(folder)
        if unread_only:
            _, messages = mail.search(None, "UNSEEN")
        else:
            _, messages = mail.search(None, "ALL")

        email_ids = messages[0].split()
        email_ids = email_ids[-limit:]

        results = []
        for email_id in reversed(email_ids):
            _, msg_data = mail.fetch(email_id, "(RFC822)")
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    message = email.message_from_bytes(response_part[1])
                    results.append(
                        {
                            "id": email_id.decode(),
                            "subject": decode_str(message.get("Subject")),
                            "from": decode_str(message.get("From")),
                            "date": message.get("Date"),
                        }
                    )

        return {"success": True, "emails": results, "count": len(results)}
    finally:
        try:
            mail.close()
        except Exception:
            pass
        try:
            mail.logout()
        except Exception:
            pass


def read_email(email_id, folder="INBOX", config_path=None):
    config = load_config(config_path)
    mail = connect_imap(config)
    try:
        mail.select(folder)
        _, msg_data = mail.fetch(email_id.encode(), "(RFC822)")
        result = {}
        for response_part in msg_data:
            if isinstance(response_part, tuple):
                message = email.message_from_bytes(response_part[1])
                result = {
                    "id": email_id,
                    "subject": decode_str(message.get("Subject")),
                    "from": decode_str(message.get("From")),
                    "to": decode_str(message.get("To")),
                    "date": message.get("Date"),
                    "body": get_email_body(message)[:5000],
                }
        return {"success": True, "email": result}
    finally:
        try:
            mail.close()
        except Exception:
            pass
        try:
            mail.logout()
        except Exception:
            pass


def search_emails(query, folder="INBOX", limit=20, config_path=None):
    config = load_config(config_path)
    mail = connect_imap(config)
    try:
        mail.select(folder)
        _, messages = mail.search(None, "SUBJECT", f'"{query}"')
        email_ids = messages[0].split()
        if len(email_ids) < limit:
            _, messages = mail.search(None, "FROM", f'"{query}"')
            email_ids = list(set(email_ids + messages[0].split()))

        email_ids = email_ids[-limit:]
        results = []
        for email_id in reversed(email_ids):
            _, msg_data = mail.fetch(email_id, "(RFC822)")
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    message = email.message_from_bytes(response_part[1])
                    results.append(
                        {
                            "id": email_id.decode(),
                            "subject": decode_str(message.get("Subject")),
                            "from": decode_str(message.get("From")),
                            "date": message.get("Date"),
                        }
                    )
        return {"success": True, "emails": results, "count": len(results)}
    finally:
        try:
            mail.close()
        except Exception:
            pass
        try:
            mail.logout()
        except Exception:
            pass


def mark_email(email_id, action, folder="INBOX", config_path=None):
    config = load_config(config_path)
    mail = connect_imap(config)
    try:
        mail.select(folder)
        if action == "read":
            mail.store(email_id.encode(), "+FLAGS", "\\Seen")
            message = "Marked as read."
        elif action == "unread":
            mail.store(email_id.encode(), "-FLAGS", "\\Seen")
            message = "Marked as unread."
        elif action == "star":
            mail.store(email_id.encode(), "+FLAGS", "\\Flagged")
            message = "Starred."
        elif action == "unstar":
            mail.store(email_id.encode(), "-FLAGS", "\\Flagged")
            message = "Unstarred."
        else:
            return {"success": False, "error": f"Unknown action: {action}"}
        return {"success": True, "message": message}
    finally:
        try:
            mail.close()
        except Exception:
            pass
        try:
            mail.logout()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(
        description="IMAP mail reader using Windows Credential Manager."
    )
    subparsers = parser.add_subparsers(dest="command", help="Subcommands")

    list_parser = subparsers.add_parser("list", help="List emails")
    list_parser.add_argument("--limit", type=int, default=10, help="Max count")
    list_parser.add_argument("--folder", default="INBOX", help="Mailbox folder")
    list_parser.add_argument("--unread", action="store_true", help="Only unread")
    list_parser.add_argument("--config", help="Path to config.json")

    read_parser = subparsers.add_parser("read", help="Read one email")
    read_parser.add_argument("--id", required=True, help="Email id")
    read_parser.add_argument("--folder", default="INBOX", help="Mailbox folder")
    read_parser.add_argument("--config", help="Path to config.json")

    search_parser = subparsers.add_parser("search", help="Search emails")
    search_parser.add_argument("--query", required=True, help="Search query")
    search_parser.add_argument("--folder", default="INBOX", help="Mailbox folder")
    search_parser.add_argument("--limit", type=int, default=20, help="Max count")
    search_parser.add_argument("--config", help="Path to config.json")

    mark_parser = subparsers.add_parser("mark", help="Mark an email")
    mark_parser.add_argument("--id", required=True, help="Email id")
    mark_parser.add_argument(
        "--action",
        required=True,
        choices=["read", "unread", "star", "unstar"],
        help="Mark action",
    )
    mark_parser.add_argument("--folder", default="INBOX", help="Mailbox folder")
    mark_parser.add_argument("--config", help="Path to config.json")

    args = parser.parse_args()

    if args.command == "list":
        result = list_emails(
            limit=args.limit,
            folder=args.folder,
            unread_only=args.unread,
            config_path=args.config,
        )
    elif args.command == "read":
        result = read_email(
            email_id=args.id,
            folder=args.folder,
            config_path=args.config,
        )
    elif args.command == "search":
        result = search_emails(
            query=args.query,
            folder=args.folder,
            limit=args.limit,
            config_path=args.config,
        )
    elif args.command == "mark":
        result = mark_email(
            email_id=args.id,
            action=args.action,
            folder=args.folder,
            config_path=args.config,
        )
    else:
        parser.print_help()
        return

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
