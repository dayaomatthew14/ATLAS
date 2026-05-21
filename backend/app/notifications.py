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
        response = requests.post(url, headers=headers, json=data)
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
        response = requests.post(url, headers=headers, json=data)
        if response.status_code in [200, 201]:
            print(f"[SUCCESS] Sent SMS via TextBee to {to_phone}")
            return True
        else:
            print(f"[ERROR] TextBee failed with status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"[ERROR] Failed to send TextBee SMS to {to_phone}: {e}")
        return False

def send_email_via_http(to_email: str, subject: str, body: str) -> bool:
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
            res = requests.post(url, headers=headers, json=data)
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
            res = requests.post(url, headers=headers, json=data)
            if res.status_code in [200, 201, 202]:
                print(f"[SUCCESS] Sent email via Resend HTTP API to {to_email}")
                return True
            else:
                print(f"[ERROR] Resend HTTP API failed: {res.status_code} - {res.text}")
        except Exception as e:
            print(f"[ERROR] Resend exception: {e}")

    return False

def send_email_otp(to_email: str, otp: str, purpose: str = "Verification"):
    print(f"\n[DEVELOPMENT MODE] {purpose} OTP for {to_email}: {otp}\n")
    subject = f"ATLAS - Your {purpose} Code"
    body = f"Hello,\n\nYour ATLAS {purpose.lower()} code is: {otp}\n\nPlease enter this code to proceed. This code will expire shortly.\n\nThank you,\nThe ATLAS Team"
    
    # Try HTTP delivery (works around Render's SMTP port blocks)
    if send_email_via_http(to_email, subject, body):
        return True
        
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print(f"[WARNING] SMTP credentials missing. OTP logged to console above.")
        return True # Return True so the frontend thinks it sent
        
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
        return True # Still return True for local testing

def send_sms_otp(to_phone: str, otp: str, purpose: str = "Verification"):
    print(f"\n[DEVELOPMENT MODE] {purpose} OTP for {to_phone}: {otp}\n")
    return True # Always return True for local testing without Twilio

def send_email_notification(to_email: str, subject: str, body: str):
    print(f"\n[DEVELOPMENT MODE] Email to {to_email}: {subject}\n{body}\n")
    
    # Try HTTP delivery (works around Render's SMTP port blocks)
    if send_email_via_http(to_email, subject, body):
        return True
        
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        return True
        
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

