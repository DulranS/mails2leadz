import os
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import io
import csv
import uuid
from typing import Dict, Any
from scraper import process_row, ORIGINAL_COLUMNS, OUTPUT_COLUMNS

# This is a standalone service, deployed separately from the Next.js app
# (Render/Railway/Fly/etc — anywhere that can run a long-lived Python
# process, unlike Vercel's serverless functions). The Next app's
# app/api/leads/enrich route proxies to it. Only used for the OPTIONAL
# "find emails on business websites" lead-sourcing step — nothing else in
# the product depends on this service being deployed.
app = FastAPI()

# Restrict to your deployed Next.js app's origin via env var in production
# (comma-separated if you have more than one, e.g. a preview + prod URL).
# Defaults to "*" for local dev convenience only.
_allowed = os.environ.get("ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed.split(",")] if _allowed != "*" else ["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

jobs: Dict[str, Dict[str, Any]] = {}


@app.get("/health")
async def health():
    # Used by the Next app / uptime checks to confirm the service is up
    # before pointing ENRICHMENT_SERVICE_URL at it.
    return {"status": "ok"}

class CSVUpload(BaseModel):
    csv_content: str


def _check_service_key(x_service_key: str | None):
    # Shared secret between the Next app and this service — without this,
    # anyone who finds this URL could use it as a free, unauthenticated
    # web-scraping proxy (an SSRF/abuse risk, not just a cost one). Set the
    # SAME value for SERVICE_API_KEY here and ENRICHMENT_SERVICE_KEY in the
    # Next app's env vars. If SERVICE_API_KEY isn't set, auth is skipped —
    # fine for local dev, not for a public deployment.
    expected = os.environ.get("SERVICE_API_KEY")
    if expected and x_service_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Service-Key")


@app.post("/api/scrape")
async def scrape_emails(payload: CSVUpload, x_service_key: str | None = Header(default=None)):
    _check_service_key(x_service_key)
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "processing", "current": 0, "total": 0}
    
    try:
        f = io.StringIO(payload.csv_content)
        reader = csv.DictReader(f)
        rows = list(reader)

        missing = [col for col in ORIGINAL_COLUMNS if col not in reader.fieldnames]
        if missing:
            jobs[job_id] = {"status": "failed", "error": f"Missing columns: {missing}"}
            return JSONResponse({"job_id": job_id})

        total = len(rows)
        jobs[job_id]["total"] = total
        results = []

        for i, row in enumerate(rows):
            try:
                result = process_row(row.copy())
                results.append(result)
            except Exception as e:
                row['email'] = ""
                results.append(row)
            # Update progress
            jobs[job_id]["current"] = i + 1

        # Final output
        output_buffer = io.StringIO()
        writer = csv.DictWriter(output_buffer, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(results)

        with_email = sum(1 for r in results if r.get('email', '').strip())
        jobs[job_id] = {
            "status": "completed",
            "csv": output_buffer.getvalue(),
            "total": total,
            "with_email": with_email
        }

    except Exception as e:
        jobs[job_id] = {"status": "failed", "error": str(e)}

    return JSONResponse({"job_id": job_id})

@app.get("/api/status/{job_id}")
async def get_status(job_id: str, x_service_key: str | None = Header(default=None)):
    _check_service_key(x_service_key)
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job