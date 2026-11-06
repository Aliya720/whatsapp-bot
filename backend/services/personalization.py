import re
from typing import Dict, Any

class PersonalizationError(ValueError):
    pass

class PersonalizationService:
    """
    Renders message templates with recipient-specific variables.
    Supported variables: {{first_name}}, {{last_name}}, {{phone_number}}, {{company}}, {{custom_field_name}}
    """
    
    # Matches {{anything_inside}}
    VAR_PATTERN = re.compile(r"\{\{([^}]+)\}\}")

    @classmethod
    def render(cls, template: str, context: Dict[str, Any]) -> str:
        """
        Replaces variables in the template with values from the context.
        Raises PersonalizationError if a variable in the template is missing from the context.
        """
        def replacer(match):
            var_name = match.group(1).strip()
            
            # Check top level (e.g., first_name)
            if var_name in context:
                val = context[var_name]
                return str(val) if val is not None else ""
            
            # Check custom_data
            custom_data = context.get('custom_data', {})
            if var_name in custom_data:
                val = custom_data[var_name]
                return str(val) if val is not None else ""
                
            raise PersonalizationError(f"Missing required variable: '{var_name}'")

        return cls.VAR_PATTERN.sub(replacer, template)

    @classmethod
    def extract_variables(cls, template: str) -> list[str]:
        """
        Returns a list of unique variables found in the template.
        """
        matches = cls.VAR_PATTERN.findall(template)
        return list(set(m.strip() for m in matches))
