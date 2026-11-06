import pytest
from services.personalization import PersonalizationService, PersonalizationError

def test_personalization_render():
    template = "Hi {{first_name}}, your number is {{phone_number}}. VIP: {{vip_status}}"
    context = {
        "first_name": "Alice",
        "phone_number": "+1234567890",
        "custom_data": {
            "vip_status": "Gold"
        }
    }
    rendered = PersonalizationService.render(template, context)
    assert rendered == "Hi Alice, your number is +1234567890. VIP: Gold"

def test_personalization_missing_variable():
    template = "Hi {{first_name}}, your order {{order_id}} is ready."
    context = {
        "first_name": "Bob"
    }
    with pytest.raises(PersonalizationError, match="Missing required variable: 'order_id'"):
        PersonalizationService.render(template, context)

def test_extract_variables():
    template = "Hello {{ first_name }}, your {{ custom_field }} is here."
    vars = PersonalizationService.extract_variables(template)
    assert set(vars) == {"first_name", "custom_field"}
