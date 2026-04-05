import os

def get_coaches() -> dict[str, str]:
    """Returns {name: pin} from env var."""
    raw = os.getenv("COACHES", "")
    result = {}
    for entry in raw.split(","):
        if ":" in entry:
            name, pin = entry.split(":", 1)
            result[name.strip()] = pin.strip()
    return result

def verify_coach(name: str, pin: str) -> bool:
    coaches = get_coaches()
    return coaches.get(name) == pin