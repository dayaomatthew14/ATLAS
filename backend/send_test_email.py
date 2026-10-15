"""
Send one test message, and say plainly whether it arrived at the relay.

Run this before trusting email delivery -- ideally against a real
@dlsau.edu.ph inbox, because a deliverability problem only shows up against
the domain that will actually receive the codes.

    python send_test_email.py someone@dlsau.edu.ph

There is no verification code involved and no account is touched. It sends the
same way registration does, through the same functions, so a success here means
registration will work too.

Exit status is 0 when the message was accepted for delivery and 1 when it was
not, so this can be used in a check script.
"""

import sys

from app import notifications


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        return 1

    recipient = sys.argv[1].strip()
    if "@" not in recipient:
        print(f"'{recipient}' does not look like an email address.")
        return 1

    print()
    print(notifications.describe_delivery_readiness())
    print()

    configured = notifications.configured_transports()
    if not any(configured.values()):
        print("Nothing to test: no way of sending is configured.")
        print("Fill in SMTP_USERNAME and SMTP_PASSWORD in backend/.env, then run this again.")
        print()
        print("  SMTP_USERNAME  the Gmail address you are sending from")
        print("  SMTP_PASSWORD  an App Password for that account, not the normal password")
        print("                 (Google Account -> Security -> App passwords)")
        return 1

    print(f"Sending a test message to {recipient} ...")
    sent = notifications.send_email_notification(
        recipient,
        "ATLAS - Test message",
        "This is a test from ATLAS.\n\n"
        "If you are reading this, verification codes will reach this address.\n",
    )

    print()
    if sent:
        print("SENT. The mail server accepted the message.")
        print(f"Check {recipient} now, including the Spam folder -- the first message")
        print("from a new sender often lands there. Mark it 'Not spam' if it does.")
        return 0

    print("NOT SENT. The message was refused.")
    print("Common causes:")
    print("  - SMTP_PASSWORD is the account's normal password rather than an App Password")
    print("  - 2-Step Verification is off on the sending account, so App Passwords")
    print("    cannot be created")
    print("  - SMTP_USERNAME does not match the account the App Password belongs to")
    print("The error printed above this line says which.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
