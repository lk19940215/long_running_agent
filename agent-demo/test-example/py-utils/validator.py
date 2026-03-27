"""输入验证工具"""

import re
from typing import Optional


def is_valid_email(email: str) -> bool:
    pattern = r'^[\w.+-]+@[\w-]+\.[\w.]+$'
    return bool(re.match(pattern, email))


def is_positive_number(value) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def sanitize_input(text: str, max_length: int = 255) -> str:
    if not text:
        return ""
    cleaned = text.strip()
    cleaned = re.sub(r'<[^>]+>', '', cleaned)
    return cleaned[:max_length]


def validate_range(value: float, min_val: float, max_val: float) -> Optional[str]:
    if value < min_val:
        return f"Value {value} is below minimum {min_val}"
    if value > max_val:
        return f"Value {value} exceeds maximum {max_val}"
    return None
