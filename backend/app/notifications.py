import os
import smtplib
import requests
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

# Email Config
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

# SMS goes through TextBee. Twilio's SDK and configuration used to sit here --
# imported, three variables read, and never once used to send anything. Keeping
# a dead alternative in view invites the next person to wire it up rather than
# fix the gateway that is actually in service.

# TextBee Config
TEXTBEE_API_KEY = os.getenv("TEXTBEE_API_KEY")
TEXTBEE_DEVICE_ID = os.getenv("TEXTBEE_DEVICE_ID")

# A transport that never answers would otherwise hold the request thread open
# for as long as the peer keeps the socket alive, and OTP delivery sits inside
# the registration and password-reset requests a user is waiting on.
HTTP_TIMEOUT_SECONDS = 15

# The TextBee app refreshes its Firebase push token when it runs. A token older
# than this means the app has not been alive on the handset for a long time, and
# a push that cannot land is a message that is accepted and never transmitted.
FCM_STALE_AFTER_DAYS = 30


def _is_production() -> bool:
    """Read at call time so tests and a reloading server see changes."""
    return os.getenv("ENV") == "production"


def log_otp_for_development(destination: str, otp: str, purpose: str):
    """
    Print an OTP to the console -- outside production only.

    This used to print unconditionally, labelled "[DEVELOPMENT MODE]" while
    running in production, so every verification and password-reset code for
    every account was sitting in the deployed service's log stream. Anyone who
    could read those logs could take over any account without touching the
    user's email or phone, and the label made the line look harmless.

    A code is a bearer credential. In production the log records only that one
    was issued; an administrator who needs to recover an account does it
    through User Management rather than by reading a secret out of a log.
    """
    if _is_production():
        print(f"[OTP] Issued {purpose.lower()} code for {destination} (value not logged)")
    else:
        print(f"\n[DEVELOPMENT] {purpose} OTP for {destination}: {otp}\n")

def textbee_device_status() -> dict:
    """
    Ask TextBee about the gateway handset, defensively.

    TextBee is not an SMS carrier -- it is a relay to an Android phone running
    its app, and that phone is what actually transmits. When the phone is off,
    asleep without the app running, or has no signal, the API still accepts
    messages and answers "SMS added to queue for processing". Nothing further
    happens until the handset connects, and nothing in the send response
    distinguishes that from a message about to go out.

    The response shape is not contractually documented here, so every field is
    read optionally and the raw body is logged. An unreadable answer returns
    `{"known": False}` and must never block a send: a working gateway that this
    function cannot parse is far more likely than a real outage.
    """
    if not TEXTBEE_API_KEY or not TEXTBEE_DEVICE_ID:
        return {"known": False}

    url = f"https://api.textbee.dev/api/v1/gateway/devices/{TEXTBEE_DEVICE_ID}"
    try:
        res = requests.get(url, headers={"x-api-key": TEXTBEE_API_KEY}, timeout=HTTP_TIMEOUT_SECONDS)
        snippet = " ".join((res.text or "").split())[:300]
        if res.status_code != 200:
            print(f"[TEXTBEE] Could not read device status (HTTP {res.status_code}): {snippet}")
            return {"known": False}

        print(f"[TEXTBEE] Device status: {snippet}")
        payload = res.json()
        device = payload.get("data", payload) if isinstance(payload, dict) else {}
        if not isinstance(device, dict):
            return {"known": False}

        # `enabled` only says the device record is switched on. It is true for a
        # handset that has not spoken to TextBee in months, which is precisely
        # the state that loses messages: TextBee wakes the app with a Firebase
        # push, and a stale FCM token means the push goes nowhere and the SMS
        # waits in a queue for a phone that is never told to send it.
        stale_days = None
        raw = device.get("fcmTokenUpdatedAt")
        if raw:
            try:
                seen = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                stale_days = (datetime.now(timezone.utc) - seen).days
            except Exception:
                stale_days = None

        if stale_days is not None and stale_days > FCM_STALE_AFTER_DAYS:
            print(
                f"[TEXTBEE] WARNING: the gateway's push token was last refreshed "
                f"{stale_days} days ago. TextBee wakes the handset with a Firebase "
                f"push, so a token this old usually means messages are accepted and "
                f"then never transmitted. Open the TextBee app on the device to "
                f"re-register it."
            )

        # Different builds of the gateway report this differently; take the
        # first field that is actually present rather than assuming one.
        for field in ("enabled", "online", "connected", "isOnline"):
            if field in device:
                return {
                    "known": True,
                    "online": bool(device[field]),
                    "field": field,
                    "stale_days": stale_days,
                }
        return {"known": False, "stale_days": stale_days}
    except Exception as e:
        print(f"[TEXTBEE] Device status check failed: {e}")
        return {"known": False}


def send_textbee_otp(to_phone: str, otp: str, purpose: str = "Verification"):
    """
    Send a code by SMS through the TextBee gateway.

    TextBee relays through an Android handset running its app, so a 2xx means
    the message was *accepted for* that device -- not that the device was
    online, and not that anything was transmitted. The old check read the status
    alone and logged "[SUCCESS] Sent SMS", which is the same ambiguity that made
    the email path impossible to diagnose. The response body is now logged
    either way, because it is the only thing that distinguishes accepted-and-
    sent from accepted-and-queued-for-a-phone-that-is-switched-off.
    """
    if not TEXTBEE_API_KEY or not TEXTBEE_DEVICE_ID:
        print(f"[WARNING] TextBee credentials missing. Could not send {purpose} OTP to {to_phone}")
        return False

    url = f"https://api.textbee.dev/api/v1/gateway/devices/{TEXTBEE_DEVICE_ID}/send-sms"
    headers = {
        "x-api-key": TEXTBEE_API_KEY,
        "Content-Type": "application/json"
    }
    data = {
        "recipients": [to_phone],
        "message": f"Your ATLAS {purpose.lower()} code is: {otp}"
    }

    # Checked before sending, because queuing a code for a handset that is not
    # collecting is indistinguishable from sending one, and the user is told to
    # go and look at their phone either way.
    status = textbee_device_status()
    if status.get("known") and not status.get("online"):
        print(
            f"[ERROR] TextBee gateway device is not online "
            f"(reported by '{status.get('field')}'), so the {purpose.lower()} SMS "
            f"for {to_phone} would only sit in a queue. Not sending."
        )
        return False

    try:
        response = requests.post(url, headers=headers, json=data, timeout=HTTP_TIMEOUT_SECONDS)
        snippet = " ".join((response.text or "").split())[:250]

        if response.status_code not in [200, 201]:
            print(f"[ERROR] TextBee failed with status {response.status_code}: {snippet}")
            return False

        # "SMS added to queue for processing" is the answer TextBee gives when
        # the message is waiting for the handset. It is reported as accepted
        # rather than sent, because the difference is the whole problem: a
        # queued code arrives whenever the phone next connects, which may be
        # never, and telling a user it was sent leaves them watching a phone
        # for something that is not coming.
        queued = "queue" in snippet.lower()
        if queued:
            print(
                f"[QUEUED] TextBee queued the {purpose.lower()} SMS for {to_phone}; "
                f"it will only arrive once the gateway handset connects. Response: {snippet}"
            )
        else:
            print(f"[SUCCESS] TextBee accepted {purpose} SMS for {to_phone}. Response: {snippet}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to send TextBee SMS to {to_phone}: {e}")
        return False


def deliver_otp(to_email, to_phone, otp: str, purpose: str = "Verification",
                channel: str = "auto") -> dict:
    """
    Get a code to a person.

    `channel` is "auto" by default: email first, SMS only if email failed. Email
    leads because it costs nothing per message and lands somewhere the code can
    be re-read; SMS is a fallback rather than a duplicate, since the gateway is
    a handset on a metered plan with a free-tier daily cap, and spending one on
    every send exhausts the allowance on codes the user already had by email.

    "sms" and "email" force a single channel. Forcing SMS is what the person
    stuck at the verify screen actually needs: the server only knows a relay
    accepted the email, while they know it never arrived, so the useful move is
    to let them choose the other route rather than resend down the one that is
    already failing.

    Returns which channels succeeded, so a caller can tell a user nothing
    reached them instead of claiming a code is on its way.
    """
    email_sent = False
    sms_sent = False

    if channel in ("auto", "email") and to_email:
        email_sent = bool(send_email_otp(to_email, otp, purpose))

    if channel == "sms" and to_phone:
        sms_sent = bool(send_textbee_otp(to_phone, otp, purpose))
    elif channel == "auto" and not email_sent and to_phone:
        print(f"[FALLBACK] Email did not send; trying SMS for {purpose.lower()} code.")
        sms_sent = bool(send_textbee_otp(to_phone, otp, purpose))

    return {
        "email": email_sent,
        "sms": sms_sent,
        "delivered": email_sent or sms_sent,
    }

def send_textbee_notification(to_phone: str, message: str):
    if not TEXTBEE_API_KEY or not TEXTBEE_DEVICE_ID:
        print(f"[WARNING] TextBee credentials missing. Could not send notification to {to_phone}")
        return False
        
    url = f"https://api.textbee.dev/api/v1/gateway/devices/{TEXTBEE_DEVICE_ID}/send-sms"
    headers = {
        "x-api-key": TEXTBEE_API_KEY,
        "Content-Type": "application/json"
    }
    data = {
        "recipients": [to_phone],
        "message": message
    }
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=HTTP_TIMEOUT_SECONDS)
        if response.status_code in [200, 201]:
            print(f"[SUCCESS] Sent SMS via TextBee to {to_phone}")
            return True
        else:
            print(f"[ERROR] TextBee failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"[ERROR] Failed to send TextBee SMS to {to_phone}: {e}")
        return False

def _apps_script_delivered(res) -> bool:
    """
    Whether a Google Apps Script web app actually sent the mail.

    HTTP 200 does not mean it did. A web app deployed with access set to anything
    narrower than "Anyone" answers an unauthenticated POST with 200 and a Google
    sign-in *page*; a script that throws returns 200 and an HTML error page. The
    old check read the status alone, so both of those logged "[SUCCESS] Sent
    email" while nothing left Google -- which is exactly the failure that looked
    like a mystery rather than an error.

    A deployed script that ran returns its own short text or JSON, so an HTML
    document in the body is the reliable tell.
    """
    if res.status_code != 200:
        return False
    body = (res.text or "").strip()
    lowered = body[:400].lower()
    if lowered.startswith("<!doctype html") or lowered.startswith("<html") or "<title>" in lowered:
        return False
    if "accounts.google.com" in lowered or "sign in" in lowered:
        return False
    return True


def _send_via_sendgrid(to_email: str, subject: str, body: str) -> bool:
    key = os.getenv("SENDGRID_API_KEY")
    sender = os.getenv("SENDGRID_SENDER_EMAIL")
    if not (key and sender):
        return False

    try:
        res = requests.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "personalizations": [{"to": [{"email": to_email}]}],
                "from": {"email": sender, "name": "ATLAS Academic Timetabling System"},
                "subject": subject,
                "content": [{"type": "text/plain", "value": body}],
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        if res.status_code in (200, 201, 202):
            print(f"[SUCCESS] Sent email via SendGrid to {to_email}")
            return True
        print(f"[ERROR] SendGrid failed: {res.status_code} - {res.text[:200]}")
    except Exception as e:
        print(f"[ERROR] SendGrid exception: {e}")
    return False


def _send_via_resend(to_email: str, subject: str, body: str) -> bool:
    key = os.getenv("RESEND_API_KEY")
    if not key:
        return False

    # Resend's onboarding domain works without owning a domain, but only
    # delivers to the address that registered the account. Real recipients need
    # a verified domain and RESEND_SENDER_EMAIL set to an address on it.
    sender = os.getenv("RESEND_SENDER_EMAIL", "onboarding@resend.dev")
    try:
        res = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "from": f"ATLAS Academic Timetabling System <{sender}>",
                "to": [to_email],
                "subject": subject,
                "text": body,
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        if res.status_code in (200, 201, 202):
            print(f"[SUCCESS] Sent email via Resend to {to_email}")
            return True
        print(f"[ERROR] Resend failed: {res.status_code} - {res.text[:200]}")
    except Exception as e:
        print(f"[ERROR] Resend exception: {e}")
    return False


def send_email_via_http(to_email: str, subject: str, body: str) -> bool:
    # Ordered worst-last. Apps Script used to be tried first and, because it
    # answers {"status":"success"} whenever the script runs, it always won --
    # so SendGrid and Resend were unreachable no matter how they were
    # configured. Adding a real provider looked like it did nothing.
    #
    # SendGrid and Resend are transactional senders: they authenticate the
    # sending domain, report per-message delivery, and are what inbox providers
    # expect transactional mail to come from. Apps Script relays through a
    # consumer Gmail account, has a daily cap around a hundred, and its reply
    # says only that the script ran -- not that anything was accepted for
    # delivery. It stays as a free fallback, not the default.
    if _send_via_sendgrid(to_email, subject, body):
        return True
    if _send_via_resend(to_email, subject, body):
        return True

    # Last resort: Google Apps Script Web App (free, relays via a Gmail account)
    script_url = os.getenv("GOOGLE_SCRIPT_URL")
    if script_url:
        url = script_url
        data = {
            "to": to_email,
            "subject": subject,
            "body": body
        }
        try:
            # Google Apps Script redirects require handling redirects, requests does it by default
            res = requests.post(url, json=data, timeout=HTTP_TIMEOUT_SECONDS)
            # The body is logged on the success path too, not just on failure.
            # A script that returns 200 having caught its own error is
            # indistinguishable from one that sent, and that ambiguity is what
            # made undelivered mail impossible to diagnose from the outside.
            snippet = " ".join((res.text or "").split())[:200]
            if _apps_script_delivered(res):
                print(f"[SUCCESS] Sent email via Google Apps Script to {to_email}. Response: {snippet}")
                return True
            # The body is what identifies the cause -- a sign-in page means the
            # deployment is not public, an error page means the script raised.
            snippet = " ".join((res.text or "").split())[:300]
            print(f"[ERROR] Google Apps Script did not send (HTTP {res.status_code}). Response: {snippet}")
        except Exception as e:
            print(f"[ERROR] Google Apps Script exception: {e}")

    return False

def send_email_otp(to_email: str, otp: str, purpose: str = "Verification"):
    """
    Deliver an OTP by email. Returns whether it was actually sent.

    The return value used to be True on every path, including "no SMTP
    credentials" and "sending raised" -- one branch said so outright: "Return
    True so the frontend thinks it sent." So a user who never received a code
    was told one was on its way, and the only sign of the failure was a console
    line nobody was reading. Reporting the truth is what lets the caller say
    something useful instead.
    """
    log_otp_for_development(to_email, otp, purpose)
    subject = f"ATLAS - Your {purpose} Code"
    body = f"Hello,\n\nYour ATLAS {purpose.lower()} code is: {otp}\n\nPlease enter this code to proceed. This code will expire shortly.\n\nThank you,\nThe ATLAS Team"

    # Try HTTP delivery (works around cloud provider SMTP port blocks)
    if send_email_via_http(to_email, subject, body):
        return True

    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print(f"[ERROR] No email transport configured; {purpose.lower()} code for {to_email} was not sent.")
        return False

    msg = MIMEMultipart()
    msg['From'] = f"ATLAS System <{SMTP_USERNAME}>"
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"[SUCCESS] Sent {purpose} email to {to_email}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to send email to {to_email}: {e}")
        return False

# `send_sms_otp` was removed. It printed the code and returned True without
# sending anything, and nothing called it -- the SMS path is send_textbee_otp.
# Leaving it in place invited a caller to believe SMS had been delivered.


def send_email_notification(to_email: str, subject: str, body: str):
    if not _is_production():
        print(f"\n[DEVELOPMENT] Email to {to_email}: {subject}\n{body}\n")


    # Try HTTP delivery (works around cloud provider SMTP port blocks)
    if send_email_via_http(to_email, subject, body):
        return True

    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print(f"[ERROR] No email transport configured; notification to {to_email} was not sent.")
        return False


    msg = MIMEMultipart()
    msg['From'] = f"ATLAS System <{SMTP_USERNAME}>"
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))
    
    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"[ERROR] Failed to send email to {to_email}: {e}")
        return False

