import pytest
import os
from models.enums import MessagingMode
from providers.factory import ProviderFactory
from providers.personal.provider import PersonalWhatsAppProvider, MockPersonalWhatsAppProvider
from providers.professional.provider import MetaWhatsAppCloudProvider, MockProfessionalWhatsAppProvider

def test_provider_factory_isolation():
    """
    Ensures that the ProviderFactory dispenses the strictly correct implementation.
    """
    # Test Mock mode
    os.environ["USE_MOCK_PROVIDERS"] = "true"
    personal_provider = ProviderFactory.get_provider(MessagingMode.PERSONAL)
    assert isinstance(personal_provider, MockPersonalWhatsAppProvider)
    
    professional_provider = ProviderFactory.get_provider(MessagingMode.PROFESSIONAL)
    assert isinstance(professional_provider, MockProfessionalWhatsAppProvider)

    # Test Real mode
    os.environ["USE_MOCK_PROVIDERS"] = "false"
    real_personal = ProviderFactory.get_provider(MessagingMode.PERSONAL)
    assert isinstance(real_personal, PersonalWhatsAppProvider)

    real_professional = ProviderFactory.get_provider(MessagingMode.PROFESSIONAL)
    assert isinstance(real_professional, MetaWhatsAppCloudProvider)

def test_provider_factory_invalid_mode():
    with pytest.raises(ValueError):
        ProviderFactory.get_provider("invalid_mode")
