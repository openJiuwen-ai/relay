#!/usr/bin/env python3
"""
Store and resolve email-manager secrets with Windows Credential Manager.
"""

import argparse
import ctypes
from ctypes import wintypes
import json
import os
from urllib.parse import quote, unquote, urlparse

ERROR_NOT_FOUND = 1168
CRED_TYPE_GENERIC = 1
CRED_PERSIST_LOCAL_MACHINE = 2
NAMESPACE = "OfficeClaw"
PREFIX = f"wincred://{NAMESPACE}/email-manager/"


class FILETIME(ctypes.Structure):
    _fields_ = [
        ("dwLowDateTime", wintypes.DWORD),
        ("dwHighDateTime", wintypes.DWORD),
    ]


class CREDENTIALW(ctypes.Structure):
    _fields_ = [
        ("Flags", wintypes.DWORD),
        ("Type", wintypes.DWORD),
        ("TargetName", wintypes.LPWSTR),
        ("Comment", wintypes.LPWSTR),
        ("LastWritten", FILETIME),
        ("CredentialBlobSize", wintypes.DWORD),
        ("CredentialBlob", ctypes.POINTER(ctypes.c_ubyte)),
        ("Persist", wintypes.DWORD),
        ("AttributeCount", wintypes.DWORD),
        ("Attributes", wintypes.LPVOID),
        ("TargetAlias", wintypes.LPWSTR),
        ("UserName", wintypes.LPWSTR),
    ]


PCREDENTIALW = ctypes.POINTER(CREDENTIALW)


def _require_windows():
    if os.name != "nt":
        raise RuntimeError("Windows Credential Manager is only available on Windows.")


def _advapi32():
    _require_windows()
    library = ctypes.WinDLL("Advapi32.dll", use_last_error=True)
    library.CredReadW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        ctypes.POINTER(PCREDENTIALW),
    ]
    library.CredReadW.restype = wintypes.BOOL
    library.CredWriteW.argtypes = [PCREDENTIALW, wintypes.DWORD]
    library.CredWriteW.restype = wintypes.BOOL
    library.CredDeleteW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD]
    library.CredDeleteW.restype = wintypes.BOOL
    library.CredFree.argtypes = [wintypes.LPVOID]
    library.CredFree.restype = None
    return library


def make_secret_ref(kind: str, user: str) -> str:
    normalized_kind = kind.strip().lower()
    if normalized_kind not in {"imap", "smtp"}:
        raise ValueError("kind must be one of: imap, smtp")
    normalized_user = user.strip()
    if not normalized_user:
        raise ValueError("user must not be empty")
    encoded_user = quote(normalized_user, safe="")
    return f"{PREFIX}{normalized_kind}/{encoded_user}"


def parse_secret_ref(secret_ref: str):
    parsed = urlparse(secret_ref)
    if parsed.scheme != "wincred":
        raise ValueError("Unsupported secret ref scheme.")
    if parsed.netloc != NAMESPACE:
        raise ValueError("Unsupported secret ref namespace.")

    path = parsed.path.strip("/")
    parts = path.split("/")
    if len(parts) != 3 or parts[0] != "email-manager":
        raise ValueError("Unsupported secret ref path.")

    kind = parts[1]
    if kind not in {"imap", "smtp"}:
        raise ValueError("Unsupported secret ref kind.")

    user = unquote(parts[2])
    target_name = f"{NAMESPACE}/email-manager/{kind}/{parts[2]}"
    return kind, user, target_name


def store_secret(kind: str, user: str, secret: str) -> str:
    if not secret:
        raise ValueError("secret must not be empty")

    secret_ref = make_secret_ref(kind, user)
    _, _, target_name = parse_secret_ref(secret_ref)
    encoded_secret = secret.encode("utf-16-le")
    blob = (ctypes.c_ubyte * len(encoded_secret)).from_buffer_copy(encoded_secret)

    credential = CREDENTIALW()
    credential.Type = CRED_TYPE_GENERIC
    credential.TargetName = target_name
    credential.CredentialBlobSize = len(encoded_secret)
    credential.CredentialBlob = ctypes.cast(blob, ctypes.POINTER(ctypes.c_ubyte))
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE
    credential.UserName = user

    if not _advapi32().CredWriteW(ctypes.byref(credential), 0):
        code = ctypes.get_last_error()
        raise RuntimeError(f"CredWriteW failed (win32={code})")
    return secret_ref


def resolve_secret_ref(secret_ref: str) -> str:
    _, _, target_name = parse_secret_ref(secret_ref)
    credential_ptr = PCREDENTIALW()
    library = _advapi32()
    if not library.CredReadW(target_name, CRED_TYPE_GENERIC, 0, ctypes.byref(credential_ptr)):
        code = ctypes.get_last_error()
        if code == ERROR_NOT_FOUND:
            raise RuntimeError(f"Secret ref not found in Windows Credential Manager: {secret_ref}")
        raise RuntimeError(f"CredReadW failed (win32={code})")

    try:
        credential = credential_ptr.contents
        size = int(credential.CredentialBlobSize)
        if size <= 0:
            return ""
        raw = ctypes.string_at(credential.CredentialBlob, size)
        return raw.decode("utf-16-le")
    finally:
        library.CredFree(credential_ptr)


def delete_secret(secret_ref: str) -> None:
    _, _, target_name = parse_secret_ref(secret_ref)
    if not _advapi32().CredDeleteW(target_name, CRED_TYPE_GENERIC, 0):
        code = ctypes.get_last_error()
        if code == ERROR_NOT_FOUND:
            return
        raise RuntimeError(f"CredDeleteW failed (win32={code})")


def _print_result(payload: dict):
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description="Manage email-manager secrets in Windows Credential Manager."
    )
    subparsers = parser.add_subparsers(dest="command", help="Subcommands")

    set_parser = subparsers.add_parser("set", help="Store a secret")
    set_parser.add_argument("--kind", required=True, choices=["imap", "smtp"])
    set_parser.add_argument("--user", required=True)
    set_parser.add_argument("--secret", required=True)

    get_parser = subparsers.add_parser("get", help="Resolve a secret ref")
    get_parser.add_argument("--ref", required=True)

    delete_parser = subparsers.add_parser("delete", help="Delete a secret")
    delete_parser.add_argument("--ref", required=True)

    ref_parser = subparsers.add_parser("make-ref", help="Create a secret ref")
    ref_parser.add_argument("--kind", required=True, choices=["imap", "smtp"])
    ref_parser.add_argument("--user", required=True)

    args = parser.parse_args()

    if args.command == "set":
        secret_ref = store_secret(args.kind, args.user, args.secret)
        _print_result({"success": True, "ref": secret_ref})
        return

    if args.command == "get":
        kind, user, _ = parse_secret_ref(args.ref)
        secret = resolve_secret_ref(args.ref)
        _print_result(
            {
                "success": True,
                "ref": args.ref,
                "kind": kind,
                "user": user,
                "secret_loaded": True,
                "secret_length": len(secret),
            }
        )
        return

    if args.command == "delete":
        delete_secret(args.ref)
        _print_result({"success": True, "ref": args.ref})
        return

    if args.command == "make-ref":
        secret_ref = make_secret_ref(args.kind, args.user)
        _print_result({"success": True, "ref": secret_ref})
        return

    parser.print_help()


if __name__ == "__main__":
    main()
