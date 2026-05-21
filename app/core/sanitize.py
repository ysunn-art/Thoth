INJECTION_MARKERS = [
    "[INTERVIEW_COMPLETE]",
    "ignore previous instructions",
    "ignore all prior instructions",
    "ignore prior instructions",
    "system:",
    "you are now",
    "new instructions:",
    "override:",
    "forget everything",
    "disregard above",
    "disregard previous",
]

import re


def sanitize_input(text: str) -> str:
    for marker in INJECTION_MARKERS:
        text = re.sub(re.escape(marker), "[FILTERED]", text, flags=re.IGNORECASE)
    return text
