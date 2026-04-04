from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Field, Session, SQLModel, create_engine, select
from sqlalchemy import UniqueConstraint, text
from datetime import datetime
from typing import Optional
import json
import os
import re

# ─────────────────────────────────────────────────────────────
#  Database
#  Local:      SQLite file next to main.py (default)
#  Production: set DATABASE_URL env var to postgres connection string
# ─────────────────────────────────────────────────────────────

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{os.path.join(os.path.dirname(__file__), 'drills.db')}"
)
engine = create_engine(DATABASE_URL)


class Drill(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("coach", "slug", name="uq_coach_slug"),)

    id:        Optional[int] = Field(default=None, primary_key=True)
    coach:     str
    slug:      str
    title:     str
    tags:      str           = "[]"   # JSON array stored as string
    saved_at:  datetime      = Field(default_factory=datetime.now)
    scene:     str                    # Full scene JSON as string
    thumbnail: Optional[str] = None   # base64 JPEG data-URL, generated client-side


SQLModel.metadata.create_all(engine)


def migrate_db():
    """Add any columns introduced after initial table creation."""
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE drill ADD COLUMN thumbnail TEXT"))
            conn.commit()
        except Exception:
            pass  # Column already exists — safe to ignore


migrate_db()

# ─────────────────────────────────────────────────────────────
#  App
# ─────────────────────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

COACHES_FILE = os.path.join(os.path.dirname(__file__), 'coaches.json')


def title_to_slug(title: str) -> str:
    slug = title.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug).strip('-')
    return slug or 'untitled-drill'


def load_coaches() -> dict:
    try:
        with open(COACHES_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {"allow_self_register": False, "coaches": []}


def is_valid_coach(name: str) -> bool:
    cfg = load_coaches()
    if cfg.get("allow_self_register", False):
        return bool(name.strip())
    return name.strip() in cfg.get("coaches", [])


# ─────────────────────────────────────────────────────────────
#  Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/coaches")
def get_coaches():
    """Returns only the flag — coach names stay on the server."""
    cfg = load_coaches()
    return {"allow_self_register": cfg.get("allow_self_register", False)}


@app.post("/check-coach")
async def check_coach(request: Request):
    body = await request.json()
    name = (body.get("coach") or "").strip()
    if not name or not is_valid_coach(name):
        raise HTTPException(status_code=403, detail="Coach not recognised")
    return {"ok": True}


@app.post("/save-drill")
async def save_drill(request: Request):
    body      = await request.json()
    coach     = (body.get('coach') or '').strip()
    scene     = body.get('scene', {})
    thumbnail = body.get('thumbnail') or None   # base64 data-URL or None

    if not coach:
        raise HTTPException(status_code=400, detail="Coach name is required")
    if not is_valid_coach(coach):
        raise HTTPException(status_code=403, detail="Coach not recognised")

    meta  = scene.get('metadata', {})
    title = meta.get('title', 'Untitled Drill')
    tags  = json.dumps(meta.get('tags', []))
    slug  = title_to_slug(title)

    with Session(engine) as session:
        existing = session.exec(
            select(Drill).where(Drill.coach == coach, Drill.slug == slug)
        ).first()

        if existing:
            existing.title     = title
            existing.tags      = tags
            existing.saved_at  = datetime.utcnow()
            existing.scene     = json.dumps(scene)
            if thumbnail:
                existing.thumbnail = thumbnail
            session.add(existing)
            session.commit()
            return {"message": f"Updated '{title}'", "id": existing.id}
        else:
            drill = Drill(
                coach=coach, slug=slug, title=title,
                tags=tags, scene=json.dumps(scene), thumbnail=thumbnail
            )
            session.add(drill)
            session.commit()
            session.refresh(drill)
            return {"message": f"Saved '{title}'", "id": drill.id}


@app.get("/list-drills")
async def list_drills(coach: str = Query(default="")):
    """
    Returns all drills newest-first.
    coach name is included so coaches can be credited in the library UI.
    thumbnail is included for the hover preview.
    is_mine controls whether the delete button appears.
    """
    with Session(engine) as session:
        drills = session.exec(select(Drill).order_by(Drill.saved_at.desc())).all()
        return {"drills": [
            {
                "id":        d.id,
                "title":     d.title,
                "coach":     d.coach,
                "tags":      json.loads(d.tags),
                "saved_at":  d.saved_at.isoformat(),
                "is_mine":   d.coach == coach,
                "thumbnail": d.thumbnail,
            }
            for d in drills
        ]}


@app.get("/get-drill/{drill_id}")
async def get_drill(drill_id: int):
    with Session(engine) as session:
        drill = session.get(Drill, drill_id)
        if not drill:
            raise HTTPException(status_code=404, detail="Drill not found")
        return json.loads(drill.scene)


@app.delete("/delete-drill/{drill_id}")
async def delete_drill(drill_id: int, coach: str = Query(...)):
    with Session(engine) as session:
        drill = session.get(Drill, drill_id)
        if not drill:
            raise HTTPException(status_code=404, detail="Drill not found")
        if drill.coach != coach:
            raise HTTPException(status_code=403, detail="You can only delete your own drills")
        session.delete(drill)
        session.commit()
        return {"message": "Deleted"}


# ─────────────────────────────────────────────────────────────
#  Serve frontend — must be mounted AFTER all API routes
# ─────────────────────────────────────────────────────────────

DOCS_DIR = os.path.join(os.path.dirname(__file__), '..', 'docs')
app.mount("/", StaticFiles(directory=DOCS_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)
