from fastapi import HTTPException


def raise_not_found(resource: str, id: str):
    raise HTTPException(status_code=404, detail={"error": f"{resource} '{id}' not found", "code": "NOT_FOUND"})


def guard_transition(current_status: str, required: str, action: str):
    if current_status != required:
        raise HTTPException(
            status_code=409,
            detail={
                "error": f"Cannot {action}: entry is '{current_status}', expected '{required}'",
                "code": "INVALID_TRANSITION",
            },
        )


def guard_not_rejected(current_status: str):
    if current_status == "rejected":
        raise HTTPException(
            status_code=409,
            detail={"error": "Entry is already rejected", "code": "ALREADY_REJECTED"},
        )


def raise_forbidden(reason: str):
    raise HTTPException(status_code=403, detail={"error": reason, "code": "FORBIDDEN"})
