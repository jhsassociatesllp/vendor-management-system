from sqlalchemy.orm import Session

from app.models.tds_override_log import TdsOverrideLog


def create(db: Session, log: TdsOverrideLog) -> TdsOverrideLog:
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
