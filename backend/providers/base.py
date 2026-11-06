import abc
from typing import Dict, Any

class BaseProvider(abc.ABC):
    """
    Abstract Base Class for WhatsApp Providers.
    Ensures that both Personal and Professional integrations implement a standard interface,
    allowing the Campaign Service to dispatch messages without knowing the underlying implementation.
    """
    
    @abc.abstractmethod
    def connect(self, credentials: Dict[str, Any]) -> bool:
        """
        Initializes the connection or validates credentials.
        For Personal: Might spawn a headless browser or check session.
        For Professional: Validates the permanent token against Meta APIs.
        """
        pass

    @abc.abstractmethod
    def send_message(self, recipient: str, message: str) -> bool:
        """
        Sends a single text message to a recipient.
        """
        pass

    @abc.abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """
        Returns the current connection status of the provider.
        """
        pass

    def disconnect(self) -> None:
        """
        Closes any underlying resources (e.g., browser).
        """
        pass
