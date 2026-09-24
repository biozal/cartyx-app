"""
Ids and extended JSON for the seed builder, without MongoDB's libraries.

The builder assigns every document's id itself and writes the seed plan as extended
JSON (`{"$oid": …}`, `{"$date": …}`), the form scripts/seed/plan.ts reads. An ObjectId
here has the MongoDB layout — creation second, a per-process value and a counter — so
ids still sort in creation order, as the app's own new ids do.
"""

import json
import os
import re
import threading
import time
from datetime import datetime, timezone

_PROCESS_VALUE = os.urandom(5)
_counter = int.from_bytes(os.urandom(3), "big")
_lock = threading.Lock()


class ObjectId:
    __slots__ = ("_hex",)

    def __init__(self, oid=None):
        if oid is None:
            global _counter
            with _lock:
                _counter = (_counter + 1) % 0x1000000
                count = _counter
            raw = int(time.time()).to_bytes(4, "big") + _PROCESS_VALUE + count.to_bytes(3, "big")
            self._hex = raw.hex()
        elif isinstance(oid, ObjectId):
            self._hex = oid._hex
        elif isinstance(oid, str) and re.fullmatch(r"[0-9a-fA-F]{24}", oid):
            self._hex = oid.lower()
        else:
            raise ValueError(f"Not an ObjectId: {oid!r}")

    def __str__(self):
        return self._hex

    def __repr__(self):
        return f"ObjectId('{self._hex}')"

    def __eq__(self, other):
        return isinstance(other, ObjectId) and other._hex == self._hex

    def __lt__(self, other):
        return self._hex < other._hex

    def __hash__(self):
        return hash(self._hex)


def _extended(value):
    if isinstance(value, ObjectId):
        return {"$oid": str(value)}
    if isinstance(value, datetime):
        moment = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        iso = moment.astimezone(timezone.utc).isoformat(timespec="milliseconds")
        return {"$date": iso.replace("+00:00", "Z")}
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def dumps_extended(value) -> str:
    """JSON with ids as {"$oid": hex} and datetimes as {"$date": ISO-8601 UTC}."""
    return json.dumps(value, default=_extended)
