from models.enums import MessagingMode
from providers.base import BaseProvider
from providers.personal.provider import PersonalWhatsAppProvider, MockPersonalWhatsAppProvider
from providers.professional.provider import MetaWhatsAppCloudProvider, MockProfessionalWhatsAppProvider
import os

class ProviderFactory:
    """
    Instantiates the correct provider implementation based on the campaign's mode.
    """
    
    @staticmethod
    def get_provider(mode: MessagingMode) -> BaseProvider:
        use_mock = os.getenv("USE_MOCK_PROVIDERS", "true").lower() == "true"
        
        if mode == MessagingMode.PERSONAL:
            return MockPersonalWhatsAppProvider() if use_mock else PersonalWhatsAppProvider()
        elif mode == MessagingMode.PROFESSIONAL:
            return MockProfessionalWhatsAppProvider() if use_mock else MetaWhatsAppCloudProvider()
        else:
            raise ValueError(f"Unknown messaging mode: {mode}")
