import os
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from twilio.rest import Client
from dotenv import load_dotenv

load_dotenv()

# Email Config
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

# Twilio Config
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")

# TextBee Config
TEXTBEE_API_KEY = os.getenv("TEXTBEE_API_KEY")
TEXTBEE_DEVICE_ID = os.getenv("TEXTBEE_DEVICE_ID")

# A transport that never answers would otherwise hold the request thread open
# for as long as the peer keeps the socket alive, and OTP delivery sits inside
# the registration and password-reset requests a user is waiting on.
HTTP_TIMEOUT_SECONDS = 15


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

def send_textbee_otp(to_phone: str, otp: str, purpose: str = "Verification"):
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
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=HTTP_TIMEOUT_SECONDS)
        if response.status_code in [200, 201]:
            print(f"[SUCCESS] Sent {purpose} SMS via TextBee to {to_phone}")
            return True
        else:
            print(f"[ERROR] TextBee failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"[ERROR] Failed to send TextBee SMS to {to_phone}: {e}")
        return False

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


def send_email_via_http(to_email: str, subject: str, body: str) -> bool:
    # 0. Try Google Apps Script Web App (100% Free, uses your own @dlsau.edu.ph or @gmail.com)
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

    # 1. Try SendGrid HTTP API
    sendgrid_key = os.getenv("SENDGRID_API_KEY")
    sendgrid_sender = os.getenv("SENDGRID_SENDER_EMAIL")
    if sendgrid_key and sendgrid_sender:
        url = "https://api.sendgrid.com/v3/mail/send"
        headers = {
            "Authorization": f"Bearer {sendgrid_key}",
            "Content-Type": "application/json"
        }
        data = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": sendgrid_sender, "name": "ATLAS Academic Timetabling System"},
            "subject": subject,
            "content": [{"type": "text/plain", "value": body}]
        }
        try:
            res = requests.post(url, headers=headers, json=data, timeout=HTTP_TIMEOUT_SECONDS)
            if res.status_code in [200, 201, 202]:
                print(f"[SUCCESS] Sent email via SendGrid HTTP API to {to_email}")
                return True
            else:
                print(f"[ERROR] SendGrid HTTP API failed: {res.status_code} - {res.text}")
        except Exception as e:
            print(f"[ERROR] SendGrid exception: {e}")

    # 2. Try Resend HTTP API
    resend_key = os.getenv("RESEND_API_KEY")
    if resend_key:
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json"
        }
        # Resend onboarding domain sends from onboarding@resend.dev
        sender = os.getenv("RESEND_SENDER_EMAIL", "onboarding@resend.dev")
        data = {
            "from": f"ATLAS Academic Timetabling System <{sender}>",
            "to": [to_email],
            "subject": subject,
            "text": body
        }
        try:
            res = requests.post(url, headers=headers, json=data, timeout=HTTP_TIMEOUT_SECONDS)
            if res.status_code in [200, 201, 202]:
                print(f"[SUCCESS] Sent email via Resend HTTP API to {to_email}")
                return True
            else:
                print(f"[ERROR] Resend HTTP API failed: {res.status_code} - {res.text}")
        except Exception as e:
            print(f"[ERROR] Resend exception: {e}")

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

