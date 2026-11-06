from enum import Enum

class MessagingMode(str, Enum):
    """
    Defines the two distinct operational modes for the application.
    PERSONAL: Uses local device/web automation via libraries like whatsapp-web.js (headless browser).
    PROFESSIONAL: Uses the official Meta WhatsApp Business Cloud API.
    """
    PERSONAL = "personal"
    PROFESSIONAL = "professional"
