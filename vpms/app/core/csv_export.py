import csv
import io
from typing import Any

from fastapi.responses import StreamingResponse


def rows_to_csv_response(rows: list[dict[str, Any]], filename: str) -> StreamingResponse:
    """Shared CSV formatter (Section 5's '?format=csv, implement once' rule). Takes the
    exact same list-of-dicts a report's JSON response would return, so the two formats
    can never silently diverge for the same filters."""
    output = io.StringIO()
    fieldnames = list(rows[0].keys()) if rows else []
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
