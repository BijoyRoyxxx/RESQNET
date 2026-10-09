"""Create a local administrator. Public registration always creates a user."""

import argparse
import getpass
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from backend.auth import Registration, password_hash
from backend.db import Account, Base, SessionLocal, engine


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", default="admin@resq.local")
    parser.add_argument("--name", default="RESQ Administrator")
    parser.add_argument("--generate", action="store_true")
    args = parser.parse_args()
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(Account).where(Account.email == args.email.strip().lower())):
            raise SystemExit("Account already exists; no credentials or role changed.")
        password = (
            secrets.token_urlsafe(20) if args.generate else getpass.getpass("New password (12+ characters): ")
        )
        fields = Registration(email=args.email, name=args.name, password=password)
        credential_path = Path(__file__).resolve().parents[1] / "runtime/admin-credentials.txt"
        if args.generate and credential_path.exists():
            raise SystemExit(
                "Credential file already exists. Use interactive mode for another administrator."
            )
        db.add(
            Account(email=fields.email, name=fields.name, password_hash=password_hash(password), role="admin")
        )
        db.commit()
        if args.generate:
            with credential_path.open("x", encoding="utf-8") as output:
                output.write(
                    f"RESQNET local administrator\nPortal: http://127.0.0.1:5173/#admin\nEmail: {fields.email}\nPassword: {password}\n\nKeep this file private. It is excluded from Git.\n"
                )
            print(f"Administrator created. Credentials saved to {credential_path}")
        else:
            print("Administrator created.")


if __name__ == "__main__":
    main()
