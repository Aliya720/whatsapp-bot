import phonenumbers
from phonenumbers.phonenumberutil import NumberParseException

class PhoneNormalizationError(ValueError):
    pass

def normalize_phone(phone_str: str, default_region: str = "IN") -> str:
    """
    Normalizes a phone number to E.164 format.
    If the number doesn't have a country code, it assumes `default_region`.
    Handles excel float formats (e.g. 9876543210.0), whitespace, leading zeroes,
    and missing '+' for numbers that already include country code.
    Throws PhoneNormalizationError if the number is invalid.
    """
    if phone_str is None:
        raise PhoneNormalizationError("Phone number is empty")
    
    s = str(phone_str).strip()
    if not s:
        raise PhoneNormalizationError("Phone number is empty")
    
    # Strip Excel float artifact (.0)
    if s.endswith(".0"):
        s = s[:-2].strip()
    
    # Remove surrounding quotes
    s = s.strip('"\'')
    
    # Clean leading/trailing spaces
    s = s.strip()

    if not s:
        raise PhoneNormalizationError("Phone number is empty")

    default_reg = (default_region or "IN").upper().strip()

    # Attempt 1: Standard parse with default region
    try:
        parsed = phonenumbers.parse(s, default_reg)
        if phonenumbers.is_valid_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except NumberParseException:
        pass

    # Attempt 2: If no leading '+', try prepending '+' in case country code was included without '+'
    if not s.startswith("+"):
        try:
            parsed = phonenumbers.parse("+" + s, default_reg)
            if phonenumbers.is_valid_number(parsed):
                return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        except NumberParseException:
            pass

    # If both attempts fail, raise error
    raise PhoneNormalizationError(f"Invalid phone number: {phone_str}")
