from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.doa_matrix import DoaMatrix
from app.models.permission import Permission
from app.models.role import Role
from app.models.setting import Setting
from app.models.user import User
from app.services.setting_service import BASE_BANK_RATE_KEY, DEFAULT_BASE_BANK_RATE

ROLE_NAMES = [
    "Vendor",
    "Accounts Executive",
    "Budget Controller",
    "Dept. Manager",
    "Partner / VP",
    "Finance Team",
    "Compliance / Audit",
    "System Admin",
]

PERMISSION_CODES = [
    "test.read",
    "test.write",
]

TEST_USERS = [
    {"name": "Accounts User", "email": "accounts@test.com", "password": "password123", "role": "Accounts Executive"},
    {"name": "Vendor User", "email": "vendor@test.com", "password": "password123", "role": "Vendor"},
    {"name": "Dept Manager User", "email": "deptmanager@test.com", "password": "password123", "role": "Dept. Manager"},
    {"name": "Partner User", "email": "partner@test.com", "password": "password123", "role": "Partner / VP"},
    {"name": "Admin User", "email": "admin@test.com", "password": "password123", "role": "System Admin"},
    {
        "name": "Budget Controller User",
        "email": "budgetcontroller@test.com",
        "password": "password123",
        "role": "Budget Controller",
    },
    {"name": "Finance User", "email": "finance@test.com", "password": "password123", "role": "Finance Team"},
    # Phase 4B: maker-checker on payment confirmation needs a second, distinct Finance
    # Team user (Section 5.2 — initiated_by and confirmed_by must differ).
    {"name": "Finance User 2", "email": "finance2@test.com", "password": "password123", "role": "Finance Team"},
    {"name": "Auditor User", "email": "auditor@test.com", "password": "password123", "role": "Compliance / Audit"},
]


# SRS §2.2's four indicative amount slabs. l4_role uses "Finance Team" throughout since
# that's the only Finance-ish role actually seeded (see README's Phase 4A flagged notes).
DOA_MATRIX_SEED = [
    {
        "min_amount": "0.00",
        "max_amount": "50000.00",
        "requires_l2": False,
        "requires_l3": False,
        "l2_role": None,
        "l3_role": None,
        "l4_role": "Finance Team",
    },
    {
        "min_amount": "50000.01",
        "max_amount": "200000.00",
        "requires_l2": True,
        "requires_l3": False,
        "l2_role": "Dept. Manager",
        "l3_role": None,
        "l4_role": "Finance Team",
    },
    {
        "min_amount": "200000.01",
        "max_amount": "1000000.00",
        "requires_l2": True,
        "requires_l3": True,
        "l2_role": "Dept. Manager",
        "l3_role": "Partner / VP",
        "l4_role": "Finance Team",
    },
    {
        "min_amount": "1000000.01",
        "max_amount": None,
        "requires_l2": True,
        "requires_l3": True,
        "l2_role": "Dept. Manager",
        "l3_role": "Partner / VP",
        "l4_role": "Finance Team",
    },
]


def seed() -> None:
    db = SessionLocal()
    try:
        roles_by_name = {}
        for role_name in ROLE_NAMES:
            role = db.query(Role).filter(Role.name == role_name).first()
            if role is None:
                role = Role(name=role_name)
                db.add(role)
                db.flush()
            roles_by_name[role_name] = role

        for code in PERMISSION_CODES:
            if db.query(Permission).filter(Permission.code == code).first() is None:
                db.add(Permission(code=code))

        db.commit()

        for entry in TEST_USERS:
            existing = db.query(User).filter(User.email == entry["email"]).first()
            if existing is None:
                db.add(
                    User(
                        name=entry["name"],
                        email=entry["email"],
                        hashed_password=hash_password(entry["password"]),
                        role_id=roles_by_name[entry["role"]].id,
                        is_active=True,
                    )
                )

        db.commit()

        if db.query(DoaMatrix).first() is None:
            for row in DOA_MATRIX_SEED:
                db.add(
                    DoaMatrix(l1_role="Accounts Executive", l1_tat_days=1, l2_tat_days=2, l3_tat_days=2, l4_tat_days=1, **row)
                )
            db.commit()

        if db.query(Setting).filter(Setting.key == BASE_BANK_RATE_KEY).first() is None:
            db.add(Setting(key=BASE_BANK_RATE_KEY, value=str(DEFAULT_BASE_BANK_RATE)))
            db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("Seed complete.")