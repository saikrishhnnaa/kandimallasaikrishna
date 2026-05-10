from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import csv
import uuid
import asyncio
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Tuple

import bcrypt
import jwt
import resend
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_DAYS = 7

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip()
ADMIN_ALERT_EMAIL = os.environ.get("ADMIN_ALERT_EMAIL", "").strip()
PUBLIC_API_KEY = os.environ.get("PUBLIC_API_KEY", "").strip()
APP_URL = os.environ.get("APP_URL", "").rstrip("/")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

app = FastAPI(title="Wholesale POS API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

Role = Literal["admin", "employee", "sales_agent"]


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": now_utc() + timedelta(days=JWT_EXPIRES_DAYS),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    token = None
    if creds and creds.credentials:
        token = creds.credentials
    elif request.cookies.get("access_token"):
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles: str):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return checker


def require_public_key(request: Request) -> None:
    if not PUBLIC_API_KEY:
        raise HTTPException(status_code=503, detail="Public API not configured. Set PUBLIC_API_KEY in backend/.env.")
    key = request.headers.get("X-API-Key", "") or request.query_params.get("api_key", "")
    if key != PUBLIC_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# -----------------------------------------------------------------------------
# Email (Resend) — non-blocking; no-op if RESEND_API_KEY is not set
# -----------------------------------------------------------------------------
async def send_email(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        logger.info("Email skipped (RESEND_API_KEY not set): %s -> %s", subject, to)
        return False
    if not to:
        return False
    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html},
        )
        logger.info("Email sent: %s -> %s", subject, to)
        return True
    except Exception as e:
        logger.error("Email failed: %s", e)
        return False


# -----------------------------------------------------------------------------
# Stock movements
# -----------------------------------------------------------------------------
async def apply_stock_change(
    product_id: str, qty_delta: int, reason: str, reference: str, user: dict,
    variant_id: Optional[str] = None,
) -> Optional[dict]:
    """Atomically adjust product or variant stock and log a movement."""
    if variant_id:
        res = await db.products.find_one_and_update(
            {"id": product_id, "variants.id": variant_id},
            {"$inc": {"variants.$.stock": int(qty_delta)}},
            return_document=True, projection={"_id": 0},
        )
        if not res:
            return None
        variant = next((v for v in res.get("variants", []) if v["id"] == variant_id), None)
        if not variant:
            return None
        sku = variant["sku"]
        name = f"{res['name']} · {variant['label']}"
        stock_after = int(variant.get("stock", 0))
        threshold = int(variant.get("low_stock_threshold", 10))
    else:
        res = await db.products.find_one_and_update(
            {"id": product_id},
            {"$inc": {"stock": int(qty_delta)}},
            return_document=True, projection={"_id": 0},
        )
        if not res:
            return None
        sku = res.get("sku", "")
        name = res.get("name", "")
        stock_after = int(res.get("stock", 0))
        threshold = int(res.get("low_stock_threshold", 10))

    await db.stock_movements.insert_one({
        "id": str(uuid.uuid4()),
        "product_id": product_id,
        "variant_id": variant_id,
        "sku": sku,
        "name": name,
        "qty_delta": int(qty_delta),
        "reason": reason,
        "reference": reference or "",
        "stock_after": stock_after,
        "created_by": user.get("id", "system"),
        "created_by_name": user.get("name", "System"),
        "created_at": iso(now_utc()),
    })
    if qty_delta < 0:
        prev = stock_after - int(qty_delta)
        if stock_after <= threshold < prev:
            asyncio.create_task(_low_stock_alert({**res, "stock": stock_after, "name": name, "sku": sku, "low_stock_threshold": threshold}))
    return res


async def _low_stock_alert(product: dict) -> None:
    if not ADMIN_ALERT_EMAIL:
        return
    html = f"""
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #E5E5E0;border-radius:8px">
      <p style="text-transform:uppercase;letter-spacing:0.2em;font-size:11px;color:#9C462C;margin:0">Low stock alert</p>
      <h2 style="font-size:22px;letter-spacing:-0.02em;margin:8px 0 4px">{product.get('name','')}</h2>
      <p style="color:#5C5C5C;margin:0 0 16px;font-family:monospace;font-size:12px">SKU {product.get('sku','')}</p>
      <p>Current stock: <strong>{product.get('stock', 0)} {product.get('unit', 'pcs')}</strong></p>
      <p>Threshold: {product.get('low_stock_threshold', 10)}</p>
      <p style="color:#5C5C5C;font-size:12px;margin-top:24px">Replenish stock to avoid back-orders.</p>
    </div>"""
    await send_email(ADMIN_ALERT_EMAIL, f"Low stock: {product.get('name','')}", html)


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    commission_rate: float = 0.0
    active: bool = True
    created_at: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Role
    commission_rate: float = 0.0


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[Role] = None
    commission_rate: Optional[float] = None
    active: Optional[bool] = None
    password: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    user: UserPublic
    token: str


class PriceTier(BaseModel):
    min_qty: int
    price: float


class Variant(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    sku: str
    barcode: str = ""
    price: float
    stock: int = 0
    low_stock_threshold: int = 10
    active: bool = True


class ProductImage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data_url: str  # data:image/...;base64,...
    filename: str = ""
    is_primary: bool = False


class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sku: str
    barcode: str = ""
    name: str
    description: str = ""
    category: str = "General"
    flavour: str = ""
    unit: str = "pcs"
    units_per_box: int = 1
    base_price: float
    msrp: Optional[float] = None
    distribution_price: Optional[float] = None
    wholesale_price: Optional[float] = None
    tiers: List[PriceTier] = []
    variants: List[Variant] = []
    images: List[ProductImage] = []
    stock: int = 0
    low_stock_threshold: int = 10
    active: bool = True
    created_at: str = Field(default_factory=lambda: iso(now_utc()))


class ProductCreate(BaseModel):
    sku: str
    barcode: str = ""
    name: str
    description: str = ""
    category: str = "General"
    flavour: str = ""
    unit: str = "pcs"
    units_per_box: int = 1
    base_price: float
    msrp: Optional[float] = None
    distribution_price: Optional[float] = None
    wholesale_price: Optional[float] = None
    tiers: List[PriceTier] = []
    variants: List[Variant] = []
    images: List[ProductImage] = []
    stock: int = 0
    low_stock_threshold: int = 10


class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    barcode: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    flavour: Optional[str] = None
    unit: Optional[str] = None
    units_per_box: Optional[int] = None
    base_price: Optional[float] = None
    msrp: Optional[float] = None
    distribution_price: Optional[float] = None
    wholesale_price: Optional[float] = None
    tiers: Optional[List[PriceTier]] = None
    variants: Optional[List[Variant]] = None
    images: Optional[List[ProductImage]] = None
    stock: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    active: Optional[bool] = None


class TaxComponent(BaseModel):
    label: str
    rate: float


class TaxJurisdiction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    components: List[TaxComponent] = []
    active: bool = True
    created_at: str = Field(default_factory=lambda: iso(now_utc()))


class TaxJurisdictionCreate(BaseModel):
    name: str
    components: List[TaxComponent] = []


class TaxJurisdictionUpdate(BaseModel):
    name: Optional[str] = None
    components: Optional[List[TaxComponent]] = None
    active: Optional[bool] = None


class OrderTaxLine(BaseModel):
    label: str
    rate: float
    amount: float


# Cart Drafts (saved unfinished invoices)
class DraftItem(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    quantity: int


class CartDraft(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    customer_id: Optional[str] = None
    items: List[DraftItem] = []
    notes: str = ""
    created_by: str
    created_by_name: str = ""
    created_at: str = Field(default_factory=lambda: iso(now_utc()))
    updated_at: str = Field(default_factory=lambda: iso(now_utc()))


class CartDraftCreate(BaseModel):
    name: str
    customer_id: Optional[str] = None
    items: List[DraftItem] = []
    notes: str = ""


class CartDraftUpdate(BaseModel):
    name: Optional[str] = None
    customer_id: Optional[str] = None
    items: Optional[List[DraftItem]] = None
    notes: Optional[str] = None


class CustomerPrice(BaseModel):
    product_id: str
    price: float


class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    company: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    tax_id: str = ""
    default_tax_jurisdiction_id: Optional[str] = None
    credit_limit: float = 0.0
    credit_balance: float = 0.0
    payment_terms_days: int = 30
    custom_prices: List[CustomerPrice] = []
    notes: str = ""
    active: bool = True
    created_at: str = Field(default_factory=lambda: iso(now_utc()))


class CustomerCreate(BaseModel):
    name: str
    company: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    tax_id: str = ""
    default_tax_jurisdiction_id: Optional[str] = None
    credit_limit: float = 0.0
    payment_terms_days: int = 30
    custom_prices: List[CustomerPrice] = []
    notes: str = ""


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    default_tax_jurisdiction_id: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms_days: Optional[int] = None
    custom_prices: Optional[List[CustomerPrice]] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class OrderItemIn(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    quantity: int
    unit_price_override: Optional[float] = None  # admin/employee can set a custom price per line


class OrderItem(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    sku: str
    name: str
    variant_label: str = ""
    quantity: int
    unit_price: float
    line_total: float


class TradeInIn(BaseModel):
    description: str
    quantity: int = 1
    unit_value: float
    sku: str = ""
    product_id: Optional[str] = None
    restock: bool = False
    note: str = ""


class TradeIn(BaseModel):
    description: str
    quantity: int
    unit_value: float
    line_total: float
    sku: str = ""
    product_id: Optional[str] = None
    restock: bool = False
    note: str = ""


OrderType = Literal["quote", "order", "invoice"]
OrderStatus = Literal["draft", "confirmed", "cancelled", "fulfilled"]
PayStatus = Literal["unpaid", "partial", "paid"]


class OrderCreate(BaseModel):
    customer_id: str
    items: List[OrderItemIn]
    type: OrderType = "order"
    notes: str = ""
    trade_ins: List[TradeInIn] = []
    credit_applied: float = 0.0
    tax_jurisdiction_id: Optional[str] = None


class OrderUpdate(BaseModel):
    customer_id: Optional[str] = None
    items: Optional[List[OrderItemIn]] = None
    notes: Optional[str] = None
    trade_ins: Optional[List[TradeInIn]] = None
    credit_applied: Optional[float] = None
    tax_jurisdiction_id: Optional[str] = None


class OrderOut(BaseModel):
    id: str
    number: str
    type: OrderType
    customer_id: str
    customer_name: str
    items: List[OrderItem]
    trade_ins: List[TradeIn] = []
    trade_in_total: float = 0.0
    credit_applied: float = 0.0
    subtotal: float
    tax: float
    tax_jurisdiction_id: Optional[str] = None
    tax_jurisdiction_name: str = ""
    tax_components: List[OrderTaxLine] = []
    total: float
    status: OrderStatus
    payment_status: PayStatus
    amount_paid: float
    balance_due: float
    payment_terms_days: int
    due_date: Optional[str] = None
    created_by: str
    created_by_name: str
    agent_commission_rate: float = 0.0
    agent_commission: float = 0.0
    notes: str = ""
    created_at: str
    converted_from: Optional[str] = None
    deleted_at: Optional[str] = None
    agent_can_edit: bool = False


class PaymentCreate(BaseModel):
    order_id: str
    amount: float
    method: Literal["cash", "bank_transfer", "cheque"]
    reference: str = ""
    notes: str = ""


class PaymentOut(BaseModel):
    id: str
    order_id: str
    customer_id: str
    amount: float
    method: str
    reference: str
    notes: str
    recorded_by: str
    created_at: str


# -----------------------------------------------------------------------------
# Pricing logic
# -----------------------------------------------------------------------------
async def resolve_price(product: dict, customer: dict, quantity: int, variant: Optional[dict] = None) -> float:
    # 1. Customer-specific (at product level — applies to all variants)
    for cp in customer.get("custom_prices", []) or []:
        if cp.get("product_id") == product["id"]:
            return float(cp["price"])
    # 2. Tiered pricing — parent-level, applies uniformly across variants
    best_tier_price = None
    best_tier_qty = -1
    for t in product.get("tiers", []) or []:
        mq = int(t.get("min_qty", 0))
        if quantity >= mq and mq > best_tier_qty:
            best_tier_qty = mq
            best_tier_price = float(t["price"])
    if best_tier_price is not None:
        return best_tier_price
    # 3. Variant or product base price
    if variant:
        return float(variant["price"])
    return float(product["base_price"])


# -----------------------------------------------------------------------------
# Auth endpoints
# -----------------------------------------------------------------------------
@api_router.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("active", True) or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], user["email"], user["role"])
    public = {k: v for k, v in user.items() if k != "password_hash"}
    return {"user": public, "token": token}


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}


# -----------------------------------------------------------------------------
# Users (admin)
# -----------------------------------------------------------------------------
@api_router.get("/users", response_model=List[UserPublic])
async def list_users(_: dict = Depends(require_role("admin"))):
    cursor = db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1)
    return await cursor.to_list(1000)


@api_router.post("/users", response_model=UserPublic)
async def create_user(body: UserCreate, _: dict = Depends(require_role("admin"))):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "role": body.role,
        "commission_rate": float(body.commission_rate),
        "active": True,
        "password_hash": hash_password(body.password),
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@api_router.patch("/users/{user_id}", response_model=UserPublic)
async def update_user(user_id: str, body: UserUpdate, _: dict = Depends(require_role("admin"))):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items() if k != "password"}
    if body.password:
        update["password_hash"] = hash_password(body.password)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": update}, return_document=True, projection={"_id": 0, "password_hash": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="User not found")
    return res


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current: dict = Depends(require_role("admin"))):
    if user_id == current["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    r = await db.users.delete_one({"id": user_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


# -----------------------------------------------------------------------------
# Products
# -----------------------------------------------------------------------------
@api_router.get("/products", response_model=List[Product])
async def list_products(user: dict = Depends(get_current_user)):
    cursor = db.products.find({}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(2000)


@api_router.get("/products/by-barcode/{code}")
async def get_product_by_barcode(code: str, _: dict = Depends(get_current_user)):
    code = code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Empty barcode")
    # Match product (barcode or SKU)
    p = await db.products.find_one(
        {"$or": [{"barcode": code}, {"sku": code}], "active": True},
        {"_id": 0},
    )
    if p:
        return {"product": p, "variant": None}
    # Match variant inside any product
    p2 = await db.products.find_one(
        {"$or": [{"variants.barcode": code}, {"variants.sku": code}], "active": True},
        {"_id": 0},
    )
    if p2:
        variant = next(
            (v for v in p2.get("variants", []) if v.get("barcode") == code or v.get("sku") == code),
            None,
        )
        if variant:
            return {"product": p2, "variant": variant}
    raise HTTPException(status_code=404, detail=f"No product matches barcode '{code}'")


@api_router.post("/products", response_model=Product)
async def create_product(body: ProductCreate, _: dict = Depends(require_role("admin", "employee"))):
    if await db.products.find_one({"sku": body.sku}):
        raise HTTPException(status_code=400, detail="SKU already exists")
    p = Product(**body.model_dump())
    await db.products.insert_one(p.model_dump())
    return p


@api_router.patch("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, body: ProductUpdate, _: dict = Depends(require_role("admin", "employee"))):
    update = body.model_dump(exclude_none=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "tiers" in update:
        update["tiers"] = [t if isinstance(t, dict) else t.model_dump() for t in update["tiers"]]
    res = await db.products.find_one_and_update(
        {"id": product_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Product not found")
    return res


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, _: dict = Depends(require_role("admin"))):
    r = await db.products.delete_one({"id": product_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}


# -----------------------------------------------------------------------------
# Products import / export (CSV, no images)
# -----------------------------------------------------------------------------
PRODUCT_CSV_FIELDS = [
    "sku", "barcode", "name", "description", "category", "flavour", "unit", "units_per_box",
    "base_price", "msrp", "distribution_price", "wholesale_price",
    "stock", "low_stock_threshold", "active",
    "tiers", "variants",
]


def _encode_tiers(tiers: List[dict]) -> str:
    return "; ".join(f"{int(t['min_qty'])}:{float(t['price']):.2f}" for t in (tiers or []))


def _decode_tiers(s: str) -> List[dict]:
    out = []
    for chunk in (s or "").split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ":" not in chunk:
            raise ValueError(f"Invalid tier '{chunk}' (expected min_qty:price)")
        q, p = chunk.split(":", 1)
        out.append({"min_qty": int(q.strip()), "price": float(p.strip())})
    return out


def _encode_variants(variants: List[dict]) -> str:
    parts = []
    for v in (variants or []):
        parts.append("|".join([
            v.get("label", ""),
            v.get("sku", ""),
            v.get("barcode", ""),
            f"{float(v.get('price') or 0):.2f}",
            str(int(v.get("stock") or 0)),
            str(int(v.get("low_stock_threshold") or 10)),
            "1" if v.get("active") is not False else "0",
        ]))
    return "; ".join(parts)


def _decode_variants(s: str) -> List[dict]:
    out = []
    for chunk in (s or "").split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        cells = [c.strip() for c in chunk.split("|")]
        if len(cells) < 4:
            raise ValueError(f"Invalid variant '{chunk}' (need at least label|sku|barcode|price)")
        cells += [""] * (7 - len(cells))
        label, sku, barcode, price, stock, low, active = cells[:7]
        out.append({
            "id": str(uuid.uuid4()),
            "label": label,
            "sku": sku,
            "barcode": barcode,
            "price": float(price or 0),
            "stock": int(stock or 0),
            "low_stock_threshold": int(low or 10),
            "active": (active or "1") not in ("0", "false", "False", ""),
        })
    return out


@api_router.get("/products/export")
async def export_products(_: dict = Depends(require_role("admin", "employee"))):
    items = await db.products.find({}, {"_id": 0}).to_list(5000)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=PRODUCT_CSV_FIELDS)
    w.writeheader()
    for p in items:
        def _f(k):
            v = p.get(k)
            return f"{float(v):.2f}" if v not in (None, "") else ""
        w.writerow({
            "sku": p.get("sku", ""),
            "barcode": p.get("barcode", ""),
            "name": p.get("name", ""),
            "description": p.get("description", ""),
            "category": p.get("category", ""),
            "flavour": p.get("flavour", ""),
            "unit": p.get("unit", ""),
            "units_per_box": int(p.get("units_per_box") or 1),
            "base_price": f"{float(p.get('base_price') or 0):.2f}",
            "msrp": _f("msrp"),
            "distribution_price": _f("distribution_price"),
            "wholesale_price": _f("wholesale_price"),
            "stock": int(p.get("stock") or 0),
            "low_stock_threshold": int(p.get("low_stock_threshold") or 10),
            "active": "1" if p.get("active", True) else "0",
            "tiers": _encode_tiers(p.get("tiers") or []),
            "variants": _encode_variants(p.get("variants") or []),
        })
    buf.seek(0)
    fname = f"products-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api_router.post("/products/import")
async def import_products(file: UploadFile = File(...), _: dict = Depends(require_role("admin"))):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV is empty")
    csv_cols = {(c or "").strip().lower() for c in reader.fieldnames}
    if "sku" not in csv_cols:
        raise HTTPException(status_code=400, detail="CSV must contain a 'sku' column")

    created = 0
    updated = 0
    errors: List[dict] = []
    for idx, row in enumerate(reader, start=2):
        try:
            row = {(k or "").strip().lower(): (v if v is not None else "").strip() for k, v in row.items()}
            sku = row.get("sku") or ""
            if not sku:
                raise ValueError("Missing SKU")

            # Build partial payload: only include columns the CSV actually has
            partial: dict = {"sku": sku}
            if "barcode" in csv_cols:
                partial["barcode"] = row.get("barcode", "")
            if "name" in csv_cols:
                partial["name"] = row.get("name", "") or sku
            if "description" in csv_cols:
                partial["description"] = row.get("description", "")
            if "category" in csv_cols:
                partial["category"] = row.get("category", "") or "General"
            if "flavour" in csv_cols:
                partial["flavour"] = row.get("flavour", "")
            if "unit" in csv_cols:
                partial["unit"] = row.get("unit", "") or "pcs"
            if "units_per_box" in csv_cols:
                partial["units_per_box"] = int(float(row.get("units_per_box") or 1))
            if "base_price" in csv_cols:
                partial["base_price"] = float(row.get("base_price") or 0)
            if "msrp" in csv_cols:
                partial["msrp"] = float(row.get("msrp")) if row.get("msrp") else None
            if "distribution_price" in csv_cols:
                partial["distribution_price"] = float(row.get("distribution_price")) if row.get("distribution_price") else None
            if "wholesale_price" in csv_cols:
                partial["wholesale_price"] = float(row.get("wholesale_price")) if row.get("wholesale_price") else None
            if "stock" in csv_cols:
                partial["stock"] = int(float(row.get("stock") or 0))
            if "low_stock_threshold" in csv_cols:
                partial["low_stock_threshold"] = int(float(row.get("low_stock_threshold") or 10))
            if "active" in csv_cols:
                partial["active"] = (row.get("active") or "1") not in ("0", "false", "False")
            if "tiers" in csv_cols:
                partial["tiers"] = _decode_tiers(row.get("tiers", ""))
            if "variants" in csv_cols:
                partial["variants"] = _decode_variants(row.get("variants", ""))

            existing = await db.products.find_one({"sku": sku}, {"_id": 0})
            if existing:
                # Partial update — only the columns from CSV are touched
                await db.products.update_one({"id": existing["id"]}, {"$set": partial})
                updated += 1
            else:
                # New row needs at least a price; fill defaults for missing fields
                full = {
                    "id": str(uuid.uuid4()),
                    "sku": sku,
                    "barcode": "",
                    "name": sku,
                    "description": "",
                    "category": "General",
                    "flavour": "",
                    "unit": "pcs",
                    "units_per_box": 1,
                    "base_price": 0.0,
                    "msrp": None,
                    "distribution_price": None,
                    "wholesale_price": None,
                    "stock": 0,
                    "low_stock_threshold": 10,
                    "active": True,
                    "tiers": [],
                    "variants": [],
                    "images": [],
                    "created_at": iso(now_utc()),
                }
                full.update(partial)
                await db.products.insert_one(full)
                created += 1
        except Exception as e:
            errors.append({"row": idx, "sku": (row.get("sku") if isinstance(row, dict) else "?") or "", "error": str(e)})

    return {"created": created, "updated": updated, "errors": errors}


# -----------------------------------------------------------------------------
# Tax Jurisdictions
# -----------------------------------------------------------------------------
@api_router.get("/tax-jurisdictions", response_model=List[TaxJurisdiction])
async def list_tax_jurisdictions(_: dict = Depends(get_current_user)):
    cursor = db.tax_jurisdictions.find({}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(500)


@api_router.post("/tax-jurisdictions", response_model=TaxJurisdiction)
async def create_tax_jurisdiction(body: TaxJurisdictionCreate, _: dict = Depends(require_role("admin"))):
    j = TaxJurisdiction(**body.model_dump())
    await db.tax_jurisdictions.insert_one(j.model_dump())
    return j


@api_router.patch("/tax-jurisdictions/{jurisdiction_id}", response_model=TaxJurisdiction)
async def update_tax_jurisdiction(jurisdiction_id: str, body: TaxJurisdictionUpdate, _: dict = Depends(require_role("admin"))):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "components" in update:
        update["components"] = [
            c if isinstance(c, dict) else c.model_dump() for c in update["components"]
        ]
    res = await db.tax_jurisdictions.find_one_and_update(
        {"id": jurisdiction_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Jurisdiction not found")
    return res


@api_router.delete("/tax-jurisdictions/{jurisdiction_id}")
async def delete_tax_jurisdiction(jurisdiction_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.tax_jurisdictions.update_one({"id": jurisdiction_id}, {"$set": {"active": False}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Jurisdiction not found")
    return {"ok": True}


# -----------------------------------------------------------------------------
# Customers
# -----------------------------------------------------------------------------
@api_router.get("/customers", response_model=List[Customer])
async def list_customers(user: dict = Depends(get_current_user)):
    cursor = db.customers.find({}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(2000)


@api_router.post("/customers", response_model=Customer)
async def create_customer(body: CustomerCreate, _: dict = Depends(require_role("admin", "employee", "sales_agent"))):
    c = Customer(**body.model_dump())
    await db.customers.insert_one(c.model_dump())
    return c


@api_router.patch("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, body: CustomerUpdate, _: dict = Depends(require_role("admin", "employee"))):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "custom_prices" in update:
        update["custom_prices"] = [
            cp if isinstance(cp, dict) else cp.model_dump() for cp in update["custom_prices"]
        ]
    res = await db.customers.find_one_and_update(
        {"id": customer_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Customer not found")
    return res


@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, _: dict = Depends(require_role("admin"))):
    r = await db.customers.delete_one({"id": customer_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"ok": True}


# -----------------------------------------------------------------------------
# Orders / Quotes / Invoices  (single collection, type discriminator)
# -----------------------------------------------------------------------------
async def _next_number(prefix: str) -> str:
    seq = await db.counters.find_one_and_update(
        {"_id": prefix},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    n = seq["value"] if seq and "value" in seq else 1
    return f"{prefix}-{n:05d}"


def _prefix_for(t: str) -> str:
    return {"quote": "QT", "order": "SO", "invoice": "INV"}[t]


async def _compute_lines(items_in, customer: dict) -> tuple:
    """Resolve unit prices and line totals for products + variants."""
    items: List[dict] = []
    subtotal = 0.0
    for it in items_in or []:
        d = it if isinstance(it, dict) else it.model_dump()
        product = await db.products.find_one({"id": d["product_id"]}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {d['product_id']} not found")
        qty = int(d["quantity"])
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive")
        variant = None
        variant_id = d.get("variant_id")
        if product.get("variants"):
            if not variant_id:
                raise HTTPException(status_code=400, detail=f"{product['name']} has variants — choose one")
            variant = next((v for v in product["variants"] if v["id"] == variant_id), None)
            if not variant:
                raise HTTPException(status_code=400, detail="Variant not found")
        elif variant_id:
            variant_id = None
        override = d.get("unit_price_override")
        if override is not None and override != "":
            try:
                unit_price = round(float(override), 2)
                if unit_price < 0:
                    raise ValueError
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"Invalid price override for {product['name']}")
        else:
            unit_price = await resolve_price(product, customer, qty, variant)
        line_total = round(unit_price * qty, 2)
        items.append({
            "product_id": product["id"],
            "variant_id": variant_id,
            "sku": variant["sku"] if variant else product["sku"],
            "name": product["name"],
            "variant_label": variant["label"] if variant else "",
            "quantity": qty,
            "unit_price": unit_price,
            "line_total": line_total,
        })
        subtotal += line_total
    return items, round(subtotal, 2)


def _compute_trade_ins(trade_ins_in) -> tuple:
    out: List[dict] = []
    total = 0.0
    for ti in trade_ins_in or []:
        d = ti if isinstance(ti, dict) else ti.model_dump()
        qty = max(int(d.get("quantity") or 1), 1)
        unit = float(d.get("unit_value") or 0.0)
        line = round(unit * qty, 2)
        out.append({
            "description": d.get("description", ""),
            "quantity": qty,
            "unit_value": unit,
            "line_total": line,
            "sku": d.get("sku", ""),
            "product_id": d.get("product_id"),
            "restock": bool(d.get("restock", False)),
            "note": d.get("note", ""),
        })
        total += line
    return out, round(total, 2)


async def _audit(order_id: str, action: str, current: dict, changes: dict) -> None:
    await db.order_audit.insert_one({
        "id": str(uuid.uuid4()),
        "order_id": order_id,
        "action": action,
        "changes": changes,
        "by_id": current.get("id", "system"),
        "by_name": current.get("name", "System"),
        "at": iso(now_utc()),
    })


async def _adjust_customer_credit(customer_id: str, delta: float, current: dict, reason: str, ref: str) -> None:
    if delta == 0:
        return
    await db.customers.update_one({"id": customer_id}, {"$inc": {"credit_balance": float(delta)}})
    await db.customer_credit_log.insert_one({
        "id": str(uuid.uuid4()),
        "customer_id": customer_id,
        "delta": float(delta),
        "reason": reason,
        "reference": ref,
        "by_id": current.get("id", "system"),
        "by_name": current.get("name", "System"),
        "at": iso(now_utc()),
    })


async def _resolve_tax_jurisdiction(jurisdiction_id: Optional[str], customer: dict) -> Optional[dict]:
    """Resolve which jurisdiction applies. None or unset => use customer's default. Empty string => no tax."""
    if jurisdiction_id == "":
        return None
    target_id = jurisdiction_id if jurisdiction_id else customer.get("default_tax_jurisdiction_id")
    if not target_id:
        return None
    j = await db.tax_jurisdictions.find_one({"id": target_id, "active": True}, {"_id": 0})
    return j


def _compute_tax(taxable: float, jurisdiction: Optional[dict]) -> Tuple[List[dict], float, str, Optional[str]]:
    if not jurisdiction or taxable <= 0:
        return [], 0.0, "", (jurisdiction or {}).get("id")
    components: List[dict] = []
    total = 0.0
    for c in jurisdiction.get("components", []) or []:
        rate = float(c.get("rate") or 0.0)
        amount = round(taxable * rate / 100.0, 2)
        components.append({"label": c["label"], "rate": rate, "amount": amount})
        total += amount
    return components, round(total, 2), jurisdiction.get("name", ""), jurisdiction.get("id")


async def _build_order_doc(body: OrderCreate, current: dict) -> dict:
    customer = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one item required")
    items, subtotal = await _compute_lines(body.items, customer)
    trade_ins, trade_in_total = _compute_trade_ins(body.trade_ins)
    credit_applied = round(max(0.0, float(body.credit_applied or 0.0)), 2)
    available_credit = float(customer.get("credit_balance") or 0.0)
    if credit_applied > available_credit + 0.001:
        raise HTTPException(status_code=400, detail=f"Customer has only {available_credit:.2f} credit available")
    taxable = round(max(subtotal - trade_in_total - credit_applied, 0.0), 2)
    body_dump = body.model_dump(exclude_unset=True)
    jurisdiction = await _resolve_tax_jurisdiction(body_dump.get("tax_jurisdiction_id"), customer)
    tax_components, tax_total, jur_name, jur_id = _compute_tax(taxable, jurisdiction)
    total = round(taxable + tax_total, 2)
    commission_rate = float(current.get("commission_rate") or 0.0) if current["role"] == "sales_agent" else 0.0
    commission = round(total * commission_rate / 100.0, 2)
    terms = int(customer.get("payment_terms_days", 30))
    due_date = iso(now_utc() + timedelta(days=terms)) if body.type == "invoice" else None
    return {
        "id": str(uuid.uuid4()),
        "number": await _next_number(_prefix_for(body.type)),
        "type": body.type,
        "customer_id": customer["id"],
        "customer_name": customer.get("company") or customer["name"],
        "items": items,
        "trade_ins": trade_ins,
        "trade_in_total": trade_in_total,
        "credit_applied": credit_applied,
        "subtotal": subtotal,
        "tax": tax_total,
        "tax_jurisdiction_id": jur_id,
        "tax_jurisdiction_name": jur_name,
        "tax_components": tax_components,
        "total": total,
        "status": "draft" if body.type == "quote" else "confirmed",
        "payment_status": "unpaid",
        "amount_paid": 0.0,
        "balance_due": total if body.type == "invoice" else 0.0,
        "payment_terms_days": terms,
        "due_date": due_date,
        "created_by": current["id"],
        "created_by_name": current["name"],
        "agent_commission_rate": commission_rate,
        "agent_commission": commission,
        "notes": body.notes,
        "created_at": iso(now_utc()),
        "converted_from": None,
        "deleted_at": None,
        "agent_can_edit": False,
    }


async def _check_stock(items: List[dict]) -> None:
    short = []
    for it in items:
        p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
        if not p:
            continue
        if it.get("variant_id"):
            v = next((vv for vv in p.get("variants", []) if vv["id"] == it["variant_id"]), None)
            if not v:
                continue
            if int(v.get("stock", 0)) < int(it["quantity"]):
                short.append(f"{p['name']} · {v['label']} (have {v.get('stock', 0)}, need {it['quantity']})")
        else:
            if int(p.get("stock", 0)) < int(it["quantity"]):
                short.append(f"{p['name']} (have {p.get('stock', 0)}, need {it['quantity']})")
    if short:
        raise HTTPException(status_code=400, detail="Out of stock: " + "; ".join(short))


async def _apply_decrements(items: List[dict], reference: str, user: dict) -> None:
    for it in items:
        await apply_stock_change(
            it["product_id"], -int(it["quantity"]), "order_created", reference, user,
            variant_id=it.get("variant_id"),
        )


async def _apply_restocks(items: List[dict], reference: str, user: dict, reason: str = "order_deleted") -> None:
    for it in items:
        await apply_stock_change(
            it["product_id"], int(it["quantity"]), reason, reference, user,
            variant_id=it.get("variant_id"),
        )


async def _apply_trade_in_restocks(trade_ins: List[dict], reference: str, user: dict, sign: int = 1) -> None:
    for ti in trade_ins:
        if ti.get("restock") and ti.get("product_id"):
            await apply_stock_change(ti["product_id"], sign * int(ti["quantity"]), "trade_in", reference, user)


@api_router.post("/orders", response_model=OrderOut)
async def create_order(body: OrderCreate, current: dict = Depends(get_current_user)):
    if current["role"] not in ("admin", "employee", "sales_agent"):
        raise HTTPException(status_code=403, detail="Forbidden")
    doc = await _build_order_doc(body, current)
    if doc["type"] in ("order", "invoice"):
        await _check_stock(doc["items"])
    await db.orders.insert_one(doc)
    if doc["type"] in ("order", "invoice"):
        await _apply_decrements(doc["items"], doc["number"], current)
        await _apply_trade_in_restocks(doc["trade_ins"], doc["number"], current, sign=+1)
        if doc["credit_applied"] > 0:
            await _adjust_customer_credit(
                doc["customer_id"], -doc["credit_applied"], current,
                "credit_applied_to_order", doc["number"],
            )
    await _audit(doc["id"], "created", current, {"type": doc["type"], "total": doc["total"]})
    doc.pop("_id", None)
    return doc


def _agent_filter(current: dict) -> dict:
    if current["role"] == "sales_agent":
        return {"created_by": current["id"]}
    return {}


@api_router.get("/orders/export")
async def export_orders(
    type: Optional[OrderType] = None,
    include_deleted: bool = False,
    current: dict = Depends(require_role("admin", "employee")),
):
    q: dict = _agent_filter(current)
    if type:
        q["type"] = type
    if not include_deleted:
        q["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    items = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)
    fields = [
        "number", "type", "created_at", "customer_name", "created_by_name",
        "subtotal", "trade_in_total", "credit_applied", "tax",
        "tax_jurisdiction_name", "total", "status", "payment_status",
        "amount_paid", "balance_due", "due_date", "items_summary", "notes",
    ]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields)
    w.writeheader()
    for o in items:
        items_summary = "; ".join(
            f"{it.get('sku') or ''} {it.get('name','')}"
            + (f" · {it.get('variant_label')}" if it.get('variant_label') else "")
            + f" × {int(it.get('quantity') or 0)} @ {float(it.get('unit_price') or 0):.2f}"
            for it in (o.get("items") or [])
        )
        w.writerow({
            "number": o.get("number", ""),
            "type": o.get("type", ""),
            "created_at": o.get("created_at", ""),
            "customer_name": o.get("customer_name", ""),
            "created_by_name": o.get("created_by_name", ""),
            "subtotal": f"{float(o.get('subtotal') or 0):.2f}",
            "trade_in_total": f"{float(o.get('trade_in_total') or 0):.2f}",
            "credit_applied": f"{float(o.get('credit_applied') or 0):.2f}",
            "tax": f"{float(o.get('tax') or 0):.2f}",
            "tax_jurisdiction_name": o.get("tax_jurisdiction_name", ""),
            "total": f"{float(o.get('total') or 0):.2f}",
            "status": o.get("status", ""),
            "payment_status": o.get("payment_status", ""),
            "amount_paid": f"{float(o.get('amount_paid') or 0):.2f}",
            "balance_due": f"{float(o.get('balance_due') or 0):.2f}",
            "due_date": o.get("due_date") or "",
            "items_summary": items_summary,
            "notes": o.get("notes", ""),
        })
    buf.seek(0)
    fname = f"invoices-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api_router.get("/orders", response_model=List[OrderOut])
async def list_orders(
    type: Optional[OrderType] = None,
    customer_id: Optional[str] = None,
    include_deleted: bool = False,
    deleted_only: bool = False,
    current: dict = Depends(get_current_user),
):
    q: dict = _agent_filter(current)
    if type:
        q["type"] = type
    if customer_id:
        q["customer_id"] = customer_id
    if deleted_only:
        q["deleted_at"] = {"$ne": None}
    elif not include_deleted:
        q["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    cursor = db.orders.find(q, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(2000)


@api_router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: str, current: dict = Depends(get_current_user)):
    q = {"id": order_id, **_agent_filter(current)}
    doc = await db.orders.find_one(q, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    return doc


@api_router.get("/orders/{order_id}/audit")
async def get_order_audit(order_id: str, _: dict = Depends(require_role("admin", "employee"))):
    cursor = db.order_audit.find({"order_id": order_id}, {"_id": 0}).sort("at", -1).limit(200)
    return await cursor.to_list(200)


@api_router.patch("/orders/{order_id}", response_model=OrderOut)
async def update_order(order_id: str, body: OrderUpdate, current: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Cannot edit a deleted order")

    # Permission: admin/employee always; sales_agent only if owner AND agent_can_edit
    if current["role"] == "sales_agent":
        if not order.get("agent_can_edit"):
            raise HTTPException(status_code=403, detail="This order is locked. Ask an admin to unlock it for editing.")
        if order.get("created_by") != current["id"]:
            raise HTTPException(status_code=403, detail="You can only edit your own orders")
    elif current["role"] not in ("admin", "employee"):
        raise HTTPException(status_code=403, detail="Forbidden")

    is_active_stock = order["type"] in ("order", "invoice")
    customer_id = body.customer_id or order["customer_id"]
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Items
    items_in = body.items if body.items is not None else order["items"]
    new_items, subtotal = await _compute_lines(items_in, customer)

    # Trade-ins
    if body.trade_ins is not None:
        new_trade_ins, trade_in_total = _compute_trade_ins(body.trade_ins)
    else:
        new_trade_ins = order.get("trade_ins", [])
        trade_in_total = float(order.get("trade_in_total", 0.0))

    # Credit
    new_credit = float(body.credit_applied if body.credit_applied is not None else order.get("credit_applied", 0.0))
    new_credit = round(max(0.0, new_credit), 2)
    old_credit = float(order.get("credit_applied", 0.0))
    delta_credit_applied = new_credit - old_credit
    if delta_credit_applied > 0:
        avail = float(customer.get("credit_balance") or 0.0)
        if delta_credit_applied > avail + 0.001:
            raise HTTPException(status_code=400, detail=f"Insufficient credit (need {delta_credit_applied:.2f}, have {avail:.2f})")

    # Stock reconciliation: restock OLD items, then check + decrement NEW items
    if is_active_stock:
        # Restock old items
        await _apply_restocks(order["items"], order["number"], current, "order_edited")
        # Reverse old trade-in restocks
        await _apply_trade_in_restocks(order.get("trade_ins", []), order["number"], current, sign=-1)
        # Check new
        await _check_stock(new_items)
        # Decrement new
        for it in new_items:
            await apply_stock_change(it["product_id"], -int(it["quantity"]), "order_edited", order["number"], current, variant_id=it.get("variant_id"))
        # Apply new trade-in restocks
        await _apply_trade_in_restocks(new_trade_ins, order["number"], current, sign=+1)

    # Adjust customer credit
    if delta_credit_applied != 0:
        await _adjust_customer_credit(customer_id, -delta_credit_applied, current, "credit_adjusted_on_edit", order["number"])

    # Tax: only recompute if explicitly provided OR if customer changed and original used customer default
    body_dump = body.model_dump(exclude_unset=True)
    taxable = round(max(subtotal - trade_in_total - new_credit, 0.0), 2)
    if "tax_jurisdiction_id" in body_dump:
        jurisdiction = await _resolve_tax_jurisdiction(body_dump.get("tax_jurisdiction_id"), customer)
        tax_components, tax_total, jur_name, jur_id = _compute_tax(taxable, jurisdiction)
    else:
        # keep existing jurisdiction, just rescale amounts proportionally to new taxable
        existing_id = order.get("tax_jurisdiction_id")
        if existing_id:
            jurisdiction = await db.tax_jurisdictions.find_one({"id": existing_id}, {"_id": 0})
            tax_components, tax_total, jur_name, jur_id = _compute_tax(taxable, jurisdiction)
        else:
            tax_components, tax_total, jur_name, jur_id = [], 0.0, "", None

    total = round(taxable + tax_total, 2)
    amount_paid = float(order.get("amount_paid", 0.0))
    balance_due = round(max(total - amount_paid, 0.0), 2) if order["type"] == "invoice" else 0.0
    pay_status = "paid" if balance_due <= 0.001 and amount_paid > 0 else ("partial" if amount_paid > 0 else "unpaid")
    commission_rate = float(order.get("agent_commission_rate", 0.0))
    commission = round(total * commission_rate / 100.0, 2)

    update = {
        "customer_id": customer["id"],
        "customer_name": customer.get("company") or customer["name"],
        "items": new_items,
        "trade_ins": new_trade_ins,
        "trade_in_total": trade_in_total,
        "credit_applied": new_credit,
        "subtotal": subtotal,
        "tax": tax_total,
        "tax_jurisdiction_id": jur_id,
        "tax_jurisdiction_name": jur_name,
        "tax_components": tax_components,
        "total": total,
        "balance_due": balance_due,
        "payment_status": pay_status,
        "agent_commission": commission,
        "notes": body.notes if body.notes is not None else order.get("notes", ""),
    }
    res = await db.orders.find_one_and_update(
        {"id": order_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    await _audit(order_id, "edited", current, {"updated_fields": list(update.keys()), "new_total": total})
    return res


@api_router.post("/orders/{order_id}/convert", response_model=OrderOut)
async def convert_order(order_id: str, target: OrderType, current: dict = Depends(get_current_user)):
    src = await db.orders.find_one({"id": order_id, **_agent_filter(current)}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Order not found")
    if src.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Cannot convert a deleted order")
    if src["type"] == target:
        raise HTTPException(status_code=400, detail="Already this type")
    if src["type"] == "quote" and target not in ("order", "invoice"):
        raise HTTPException(status_code=400, detail="Quote can convert to order or invoice")
    if src["type"] == "order" and target != "invoice":
        raise HTTPException(status_code=400, detail="Order can convert to invoice")
    if src["type"] == "invoice":
        raise HTTPException(status_code=400, detail="Invoice cannot convert")
    new_doc = dict(src)
    new_doc["id"] = str(uuid.uuid4())
    new_doc["number"] = await _next_number(_prefix_for(target))
    new_doc["type"] = target
    new_doc["status"] = "confirmed"
    new_doc["created_at"] = iso(now_utc())
    new_doc["converted_from"] = src["id"]
    new_doc["deleted_at"] = None
    if target == "invoice":
        new_doc["balance_due"] = new_doc["total"]
        new_doc["payment_status"] = "unpaid"
        new_doc["amount_paid"] = 0.0
        new_doc["due_date"] = iso(now_utc() + timedelta(days=int(new_doc.get("payment_terms_days", 30))))
    if src["type"] == "quote" and target in ("order", "invoice"):
        await _check_stock(new_doc["items"])
        await db.orders.insert_one(new_doc)
        await _apply_decrements(new_doc["items"], new_doc["number"], current)
        await _apply_trade_in_restocks(new_doc.get("trade_ins", []), new_doc["number"], current, sign=+1)
        if float(new_doc.get("credit_applied") or 0.0) > 0:
            await _adjust_customer_credit(
                new_doc["customer_id"], -float(new_doc["credit_applied"]), current,
                "credit_applied_to_order", new_doc["number"],
            )
    else:
        await db.orders.insert_one(new_doc)
    await _audit(new_doc["id"], f"converted_from_{src['type']}", current, {"source_id": src["id"]})
    new_doc.pop("_id", None)
    return new_doc


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, current: dict = Depends(require_role("admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Already deleted")
    if order["type"] in ("order", "invoice"):
        await _apply_restocks(order["items"], order["number"], current, "order_deleted")
        await _apply_trade_in_restocks(order.get("trade_ins", []), order["number"], current, sign=-1)
        if float(order.get("credit_applied") or 0.0) > 0:
            await _adjust_customer_credit(
                order["customer_id"], float(order["credit_applied"]), current,
                "credit_refund_on_delete", order["number"],
            )
    await db.orders.update_one({"id": order_id}, {"$set": {"deleted_at": iso(now_utc())}})
    await _audit(order_id, "deleted", current, {})
    return {"ok": True, "deleted_at": iso(now_utc())}


@api_router.post("/orders/{order_id}/restore", response_model=OrderOut)
async def restore_order(order_id: str, current: dict = Depends(require_role("admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Order is not deleted")
    if order["type"] in ("order", "invoice"):
        await _check_stock(order["items"])
        await _apply_decrements(order["items"], order["number"], current)
        await _apply_trade_in_restocks(order.get("trade_ins", []), order["number"], current, sign=+1)
        if float(order.get("credit_applied") or 0.0) > 0:
            avail = float((await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0, "credit_balance": 1}) or {}).get("credit_balance", 0.0))
            if avail + 0.001 < float(order["credit_applied"]):
                raise HTTPException(status_code=400, detail=f"Insufficient credit to re-apply ({avail:.2f} available)")
            await _adjust_customer_credit(
                order["customer_id"], -float(order["credit_applied"]), current,
                "credit_reapplied_on_restore", order["number"],
            )
    res = await db.orders.find_one_and_update(
        {"id": order_id}, {"$set": {"deleted_at": None}}, return_document=True, projection={"_id": 0}
    )
    await _audit(order_id, "restored", current, {})
    return res


@api_router.post("/orders/{order_id}/agent-edit", response_model=OrderOut)
async def toggle_agent_edit(
    order_id: str,
    enabled: bool,
    current: dict = Depends(require_role("admin", "employee")),
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Cannot toggle a deleted order")
    res = await db.orders.find_one_and_update(
        {"id": order_id},
        {"$set": {"agent_can_edit": bool(enabled)}},
        return_document=True, projection={"_id": 0},
    )
    await _audit(order_id, "agent_edit_unlocked" if enabled else "agent_edit_locked", current, {})
    return res


@api_router.delete("/orders/{order_id}/purge")
async def purge_order(order_id: str, _: dict = Depends(require_role("admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Soft-delete the order first")
    await db.orders.delete_one({"id": order_id})
    return {"ok": True}


# -----------------------------------------------------------------------------
# Customer credit
# -----------------------------------------------------------------------------
class CreditAdjust(BaseModel):
    delta: float
    reason: str = "manual_adjustment"
    note: str = ""


@api_router.post("/customers/{customer_id}/credit", response_model=Customer)
async def adjust_customer_credit(customer_id: str, body: CreditAdjust, current: dict = Depends(require_role("admin", "employee"))):
    if body.delta == 0:
        raise HTTPException(status_code=400, detail="Delta cannot be zero")
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    new_balance = float(customer.get("credit_balance") or 0.0) + float(body.delta)
    if new_balance < -0.001:
        raise HTTPException(status_code=400, detail="Cannot go below zero credit")
    await _adjust_customer_credit(customer_id, float(body.delta), current, body.reason, body.note or "manual")
    res = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return res


@api_router.get("/customers/{customer_id}/credit-log")
async def list_customer_credit(customer_id: str, _: dict = Depends(require_role("admin", "employee"))):
    cursor = db.customer_credit_log.find({"customer_id": customer_id}, {"_id": 0}).sort("at", -1).limit(200)
    return await cursor.to_list(200)


def _aged_buckets(open_invoices: List[dict], reference_dt: datetime) -> dict:
    buckets = {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
    for inv in open_invoices:
        balance = float(inv.get("balance_due") or 0.0)
        if balance <= 0:
            continue
        iso_dt = inv.get("due_date") or inv.get("created_at")
        try:
            due = datetime.fromisoformat(iso_dt.replace("Z", "+00:00")) if iso_dt else reference_dt
        except (ValueError, AttributeError):
            due = reference_dt
        days = (reference_dt - due).days
        if days <= 30:
            buckets["0-30"] += balance
        elif days <= 60:
            buckets["31-60"] += balance
        elif days <= 90:
            buckets["61-90"] += balance
        else:
            buckets["90+"] += balance
    return {k: round(v, 2) for k, v in buckets.items()}


@api_router.get("/customers/{customer_id}/statement")
async def customer_statement(
    customer_id: str,
    exclude_invoice_id: Optional[str] = None,
    _: dict = Depends(require_role("admin", "employee")),
):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    inv_q = {
        "customer_id": customer_id,
        "type": "invoice",
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}],
    }
    invoices = await db.orders.find(inv_q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    if exclude_invoice_id:
        invoices_for_balance = [i for i in invoices if i["id"] != exclude_invoice_id]
    else:
        invoices_for_balance = invoices

    payments = await db.payments.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)

    total_invoiced = sum(float(i.get("total") or 0) for i in invoices_for_balance)
    total_paid = sum(float(i.get("amount_paid") or 0) for i in invoices_for_balance)
    total_outstanding = sum(float(i.get("balance_due") or 0) for i in invoices_for_balance)
    open_invoices = [i for i in invoices_for_balance if i.get("payment_status") != "paid"]

    now = now_utc()
    aged = _aged_buckets(open_invoices, now)

    trade_ins: List[dict] = []
    for inv in invoices:
        for ti in (inv.get("trade_ins") or []):
            trade_ins.append({**ti, "invoice_number": inv["number"], "invoice_date": inv["created_at"]})

    return {
        "customer": customer,
        "as_of": iso(now),
        "invoices": invoices_for_balance,
        "open_invoices": open_invoices,
        "payments": payments[:20],
        "trade_ins": trade_ins[:20],
        "total_invoiced": round(total_invoiced, 2),
        "total_paid": round(total_paid, 2),
        "total_outstanding": round(total_outstanding, 2),
        "credit_balance": float(customer.get("credit_balance") or 0),
        "credit_limit": float(customer.get("credit_limit") or 0),
        "aged_buckets": aged,
        "exclude_invoice_id": exclude_invoice_id,
    }


def _render_statement_html(stmt: dict) -> str:
    c = stmt["customer"]
    rows = "".join(
        f"<tr><td style='padding:8px;border-bottom:1px solid #E5E5E0;font-family:monospace;font-size:11px'>{i['number']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E5E0;font-size:11px'>{(i.get('due_date') or i['created_at'])[:10]}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E5E0;text-align:right;font-family:monospace'>${float(i.get('total') or 0):.2f}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E5E0;text-align:right;font-family:monospace'>${float(i.get('amount_paid') or 0):.2f}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E5E0;text-align:right;font-family:monospace;color:#9C462C'>${float(i.get('balance_due') or 0):.2f}</td></tr>"
        for i in stmt["open_invoices"]
    ) or "<tr><td colspan='5' style='padding:18px;text-align:center;color:#5C5C5C'>No open invoices.</td></tr>"
    aged = stmt["aged_buckets"]
    return f"""
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:680px;margin:auto;padding:32px;background:#fff;border:1px solid #E5E5E0;border-radius:8px">
      <p style="text-transform:uppercase;letter-spacing:0.2em;font-size:11px;color:#9C462C;margin:0">Statement</p>
      <h1 style="font-size:32px;letter-spacing:-0.02em;margin:6px 0 4px">{c.get('company') or c.get('name','')}</h1>
      <p style="color:#5C5C5C;margin:0;font-size:12px">As of {stmt['as_of'][:10]}</p>
      <div style="display:flex;gap:24px;margin-top:24px;background:#F7F7F6;padding:16px;border-radius:6px">
        <div style="flex:1"><p style="text-transform:uppercase;letter-spacing:0.2em;font-size:10px;color:#5C5C5C;margin:0">Outstanding</p><p style="font-size:24px;margin:4px 0;color:#9C462C;font-family:monospace">${stmt['total_outstanding']:.2f}</p></div>
        <div style="flex:1"><p style="text-transform:uppercase;letter-spacing:0.2em;font-size:10px;color:#5C5C5C;margin:0">Total invoiced</p><p style="font-size:18px;margin:4px 0;font-family:monospace">${stmt['total_invoiced']:.2f}</p></div>
        <div style="flex:1"><p style="text-transform:uppercase;letter-spacing:0.2em;font-size:10px;color:#5C5C5C;margin:0">Available credit</p><p style="font-size:18px;margin:4px 0;color:#2D7A4A;font-family:monospace">${stmt['credit_balance']:.2f}</p></div>
      </div>
      <h3 style="font-size:14px;margin:24px 0 8px;letter-spacing:-0.01em">Open invoices</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#F7F7F6">
          <th style="text-align:left;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">Number</th>
          <th style="text-align:left;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">Due</th>
          <th style="text-align:right;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">Total</th>
          <th style="text-align:right;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">Paid</th>
          <th style="text-align:right;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">Balance</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <h3 style="font-size:14px;margin:24px 0 8px;letter-spacing:-0.01em">Aged outstanding</h3>
      <div style="display:flex;gap:12px;font-size:12px;font-family:monospace">
        <div style="flex:1;padding:10px;background:#F7F7F6;border-radius:4px">0-30 days<br/><strong>${aged['0-30']:.2f}</strong></div>
        <div style="flex:1;padding:10px;background:#F7F7F6;border-radius:4px">31-60 days<br/><strong>${aged['31-60']:.2f}</strong></div>
        <div style="flex:1;padding:10px;background:#F7F7F6;border-radius:4px">61-90 days<br/><strong>${aged['61-90']:.2f}</strong></div>
        <div style="flex:1;padding:10px;background:#F5E7E0;border-radius:4px;color:#9C462C">90+ days<br/><strong>${aged['90+']:.2f}</strong></div>
      </div>
      <p style="color:#5C5C5C;font-size:11px;margin-top:32px;border-top:1px solid #E5E5E0;padding-top:16px">Please remit payment for outstanding balances at your earliest convenience.</p>
    </div>"""


@api_router.post("/customers/{customer_id}/statement/email")
async def email_statement(customer_id: str, current: dict = Depends(require_role("admin", "employee"))):
    stmt = await customer_statement(customer_id, None, current)
    c = stmt["customer"]
    to = (c.get("email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Customer has no email on file")
    if not RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Email service not configured. Set RESEND_API_KEY in backend/.env.")
    html = _render_statement_html(stmt)
    sent = await send_email(to, f"Account statement — {c.get('company') or c.get('name','')}", html)
    if not sent:
        raise HTTPException(status_code=502, detail="Failed to send")
    return {"ok": True, "to": to}


# -----------------------------------------------------------------------------
# Stock movements log
# -----------------------------------------------------------------------------
class StockMovement(BaseModel):
    id: str
    product_id: str
    sku: str
    name: str
    qty_delta: int
    reason: str
    reference: str
    stock_after: int
    created_by: str
    created_by_name: str
    created_at: str


@api_router.get("/stock-movements", response_model=List[StockMovement])
async def list_stock_movements(
    product_id: Optional[str] = None,
    _: dict = Depends(require_role("admin", "employee")),
):
    q: dict = {}
    if product_id:
        q["product_id"] = product_id
    cursor = db.stock_movements.find(q, {"_id": 0}).sort("created_at", -1).limit(500)
    return await cursor.to_list(500)


class StockAdjust(BaseModel):
    product_id: str
    qty_delta: int
    reason: str = "manual_adjustment"
    note: str = ""


@api_router.post("/stock-movements", response_model=StockMovement)
async def manual_stock_adjust(body: StockAdjust, current: dict = Depends(require_role("admin", "employee"))):
    if body.qty_delta == 0:
        raise HTTPException(status_code=400, detail="qty_delta cannot be 0")
    res = await apply_stock_change(body.product_id, int(body.qty_delta), body.reason, body.note, current)
    if not res:
        raise HTTPException(status_code=404, detail="Product not found")
    last = await db.stock_movements.find_one({"product_id": body.product_id}, {"_id": 0}, sort=[("created_at", -1)])
    return last


# -----------------------------------------------------------------------------
# Email invoice
# -----------------------------------------------------------------------------
def _render_invoice_html(order: dict, customer: dict) -> str:
    rows = "".join(
        f"<tr><td style='padding:8px;border-bottom:1px solid #E5E5E0;font-family:monospace;font-size:11px'>{it['sku']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E5E0'>{it['name']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E5E0;text-align:right;font-family:monospace'>{it['quantity']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E5E0;text-align:right;font-family:monospace'>${it['unit_price']:.2f}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E5E5E0;text-align:right;font-family:monospace'>${it['line_total']:.2f}</td></tr>"
        for it in order["items"]
    )
    link = f"{APP_URL}/admin/orders/{order['id']}/print" if APP_URL else ""
    return f"""
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:auto;padding:32px;background:#fff;border:1px solid #E5E5E0;border-radius:8px">
      <p style="text-transform:uppercase;letter-spacing:0.2em;font-size:11px;color:#9C462C;margin:0">{order['type']}</p>
      <h1 style="font-size:32px;letter-spacing:-0.02em;margin:6px 0 4px">{order['number']}</h1>
      <p style="color:#5C5C5C;margin:0">For <strong>{customer.get('company') or customer.get('name','')}</strong></p>
      <p style="color:#5C5C5C;font-size:12px;margin-top:4px">Due: {order.get('due_date') or '—'}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:24px;font-size:13px">
        <thead><tr style="background:#F7F7F6">
          <th style="text-align:left;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">SKU</th>
          <th style="text-align:left;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">Item</th>
          <th style="text-align:right;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">Qty</th>
          <th style="text-align:right;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">Unit</th>
          <th style="text-align:right;padding:8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase">Total</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <div style="margin-top:24px;text-align:right">
        <p style="margin:4px 0;color:#5C5C5C">Subtotal: <strong style="color:#0a0a0a;font-family:monospace">${order['subtotal']:.2f}</strong></p>
        <p style="font-size:24px;letter-spacing:-0.02em;margin:8px 0">Total: <strong style="font-family:monospace">${order['total']:.2f}</strong></p>
        <p style="font-size:12px;color:#5C5C5C">Balance due: ${order.get('balance_due', 0):.2f}</p>
      </div>
      {f'<p style="margin-top:24px"><a href="{link}" style="background:#9C462C;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">View / Print invoice</a></p>' if link else ''}
      <p style="color:#5C5C5C;font-size:11px;margin-top:32px;border-top:1px solid #E5E5E0;padding-top:16px">Sent from Wholesale POS.</p>
    </div>"""


@api_router.post("/orders/{order_id}/email")
async def email_order(order_id: str, current: dict = Depends(require_role("admin", "employee"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    to_email = (customer or {}).get("email") or ""
    if not to_email:
        raise HTTPException(status_code=400, detail="Customer has no email on file")
    if not RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Email service not configured. Add RESEND_API_KEY in backend/.env and restart.")
    html = _render_invoice_html(order, customer or {})
    sent = await send_email(to_email, f"{order['type'].title()} {order['number']}", html)
    if not sent:
        raise HTTPException(status_code=502, detail="Failed to send email. Check Resend dashboard / logs.")
    return {"ok": True, "to": to_email}


# -----------------------------------------------------------------------------
# Public catalog API (for company website integration)
# -----------------------------------------------------------------------------
class PublicProduct(BaseModel):
    id: str
    sku: str
    name: str
    description: str
    category: str
    unit: str
    base_price: float
    has_bulk_pricing: bool
    barcode: str = ""
    primary_image: Optional[str] = None
    images: List[str] = []


def _public_product_payload(p: dict) -> dict:
    imgs = p.get("images") or []
    primary = next((i.get("data_url") for i in imgs if i.get("is_primary")), None)
    if not primary and imgs:
        primary = imgs[0].get("data_url")
    return {
        "id": p["id"], "sku": p["sku"], "name": p["name"],
        "description": p.get("description", ""), "category": p.get("category", "General"),
        "unit": p.get("unit", "pcs"), "base_price": float(p["base_price"]),
        "has_bulk_pricing": bool(p.get("tiers")),
        "barcode": p.get("barcode", ""),
        "primary_image": primary,
        "images": [i.get("data_url") for i in imgs if i.get("data_url")],
    }


@api_router.get("/public/products", response_model=List[PublicProduct])
async def public_list_products(_: None = Depends(require_public_key)):
    items = await db.products.find({"active": True}, {"_id": 0}).to_list(2000)
    return [_public_product_payload(p) for p in items]


@api_router.get("/public/products/{product_id}", response_model=PublicProduct)
async def public_get_product(product_id: str, _: None = Depends(require_public_key)):
    p = await db.products.find_one({"id": product_id, "active": True}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    return _public_product_payload(p)


@api_router.get("/settings/integration")
async def get_integration_settings(_: dict = Depends(require_role("admin"))):
    return {
        "public_api_key_set": bool(PUBLIC_API_KEY),
        "public_api_key": PUBLIC_API_KEY if PUBLIC_API_KEY else None,
        "resend_configured": bool(RESEND_API_KEY),
        "sender_email": SENDER_EMAIL,
        "admin_alert_email": ADMIN_ALERT_EMAIL or None,
        "app_url": APP_URL or None,
        "public_endpoints": ["/api/public/products", "/api/public/products/{id}"],
    }


# -----------------------------------------------------------------------------
# Payments
# -----------------------------------------------------------------------------
@api_router.post("/payments", response_model=PaymentOut)
async def record_payment(body: PaymentCreate, current: dict = Depends(require_role("admin", "employee"))):
    order = await db.orders.find_one({"id": body.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["type"] != "invoice":
        raise HTTPException(status_code=400, detail="Payments only for invoices")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    new_paid = round(float(order.get("amount_paid", 0.0)) + body.amount, 2)
    if new_paid > order["total"] + 0.001:
        raise HTTPException(status_code=400, detail="Payment exceeds balance")
    balance = round(order["total"] - new_paid, 2)
    pay_status = "paid" if balance <= 0.001 else ("partial" if new_paid > 0 else "unpaid")
    pay_doc = {
        "id": str(uuid.uuid4()),
        "order_id": order["id"],
        "customer_id": order["customer_id"],
        "amount": float(body.amount),
        "method": body.method,
        "reference": body.reference,
        "notes": body.notes,
        "recorded_by": current["id"],
        "created_at": iso(now_utc()),
    }
    await db.payments.insert_one(pay_doc)
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"amount_paid": new_paid, "balance_due": max(balance, 0.0), "payment_status": pay_status}},
    )
    pay_doc.pop("_id", None)
    return pay_doc


@api_router.get("/payments", response_model=List[PaymentOut])
async def list_payments(order_id: Optional[str] = None, customer_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    q: dict = {}
    if order_id:
        q["order_id"] = order_id
    if customer_id:
        q["customer_id"] = customer_id
    cursor = db.payments.find(q, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(2000)


# -----------------------------------------------------------------------------
# Dashboard / Reports
# -----------------------------------------------------------------------------
@api_router.get("/dashboard/stats")
async def dashboard_stats(current: dict = Depends(require_role("admin", "employee"))):
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)

    invoices = await db.orders.find({"type": "invoice", "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({"type": "order", "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}, {"_id": 0}).to_list(5000)

    total_revenue = sum(i["total"] for i in invoices)
    outstanding = sum(i.get("balance_due", 0.0) for i in invoices)
    paid_total = sum(i.get("amount_paid", 0.0) for i in invoices)

    revenue_today = sum(i["total"] for i in invoices if i["created_at"] >= iso(today))
    orders_today = sum(1 for o in orders if o["created_at"] >= iso(today))

    # 7-day revenue series
    series = []
    for d in range(6, -1, -1):
        day = today - timedelta(days=d)
        nxt = day + timedelta(days=1)
        rev = sum(i["total"] for i in invoices if iso(day) <= i["created_at"] < iso(nxt))
        series.append({"date": day.strftime("%a"), "revenue": round(rev, 2)})

    # top products
    top: dict = {}
    for o in invoices + orders:
        for it in o["items"]:
            t = top.setdefault(it["product_id"], {"name": it["name"], "sku": it["sku"], "quantity": 0, "revenue": 0.0})
            t["quantity"] += it["quantity"]
            t["revenue"] += it["line_total"]
    top_products = sorted(top.values(), key=lambda x: x["revenue"], reverse=True)[:5]

    # agent leaderboard
    agents = await db.users.find({"role": "sales_agent"}, {"_id": 0, "password_hash": 0}).to_list(500)
    agent_stats = []
    for a in agents:
        a_orders = [o for o in (orders + invoices) if o["created_by"] == a["id"]]
        agent_stats.append({
            "id": a["id"],
            "name": a["name"],
            "orders": len(a_orders),
            "revenue": round(sum(o["total"] for o in a_orders), 2),
            "commission": round(sum(o.get("agent_commission", 0.0) for o in a_orders), 2),
        })
    agent_stats.sort(key=lambda x: x["revenue"], reverse=True)

    # low stock
    low_stock = await db.products.find(
        {"$expr": {"$lte": ["$stock", "$low_stock_threshold"]}, "active": True},
        {"_id": 0},
    ).to_list(50)

    return {
        "total_revenue": round(total_revenue, 2),
        "outstanding": round(outstanding, 2),
        "paid_total": round(paid_total, 2),
        "revenue_today": round(revenue_today, 2),
        "orders_today": orders_today,
        "invoices_count": len(invoices),
        "orders_count": len(orders),
        "revenue_series": series,
        "top_products": top_products,
        "agents": agent_stats,
        "low_stock": low_stock,
    }


@api_router.get("/agent/stats")
async def agent_stats(current: dict = Depends(require_role("sales_agent"))):
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    mine = await db.orders.find({"created_by": current["id"]}, {"_id": 0}).to_list(2000)
    revenue = sum(o["total"] for o in mine)
    commission = sum(o.get("agent_commission", 0.0) for o in mine)
    today_revenue = sum(o["total"] for o in mine if o["created_at"] >= iso(today))
    today_orders = sum(1 for o in mine if o["created_at"] >= iso(today))
    return {
        "total_revenue": round(revenue, 2),
        "total_commission": round(commission, 2),
        "total_orders": len(mine),
        "today_revenue": round(today_revenue, 2),
        "today_orders": today_orders,
        "commission_rate": float(current.get("commission_rate") or 0.0),
        "recent": sorted(mine, key=lambda x: x["created_at"], reverse=True)[:10],
    }


# -----------------------------------------------------------------------------
# Pricing helper for frontend (preview customer/qty pricing)
# -----------------------------------------------------------------------------
@api_router.post("/pricing/preview")
async def preview_pricing(body: dict, _: dict = Depends(get_current_user)):
    cid = body.get("customer_id")
    items = body.get("items") or []
    trade_ins_in = body.get("trade_ins") or []
    credit_applied = float(body.get("credit_applied") or 0.0)
    customer = await db.customers.find_one({"id": cid}, {"_id": 0}) if cid else None
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    out = []
    subtotal = 0.0
    for it in items:
        p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
        if not p:
            continue
        qty = int(it.get("quantity", 1))
        variant = None
        variant_id = it.get("variant_id")
        if p.get("variants") and variant_id:
            variant = next((v for v in p["variants"] if v["id"] == variant_id), None)
        override = it.get("unit_price_override")
        if override is not None and override != "":
            try:
                unit = round(float(override), 2)
                if unit < 0:
                    unit = 0.0
            except (TypeError, ValueError):
                unit = await resolve_price(p, customer, qty, variant)
        else:
            unit = await resolve_price(p, customer, qty, variant)
        line = round(unit * qty, 2)
        subtotal += line
        out.append({
            "product_id": p["id"],
            "variant_id": variant_id,
            "sku": variant["sku"] if variant else p["sku"],
            "name": p["name"],
            "variant_label": variant["label"] if variant else "",
            "quantity": qty,
            "unit_price": unit,
            "line_total": line,
            "stock": (variant or p).get("stock", 0),
        })
    trade_ins, trade_in_total = _compute_trade_ins(trade_ins_in)
    available_credit = float(customer.get("credit_balance") or 0.0)
    credit_applied = round(max(0.0, min(credit_applied, available_credit)), 2)
    taxable = round(max(round(subtotal, 2) - trade_in_total - credit_applied, 0.0), 2)
    jurisdiction_id = body.get("tax_jurisdiction_id") if "tax_jurisdiction_id" in body else None
    if "tax_jurisdiction_id" in body:
        jurisdiction = await _resolve_tax_jurisdiction(jurisdiction_id, customer)
    else:
        jurisdiction = await _resolve_tax_jurisdiction(None, customer)
    tax_components, tax_total, jur_name, jur_id = _compute_tax(taxable, jurisdiction)
    total = round(taxable + tax_total, 2)
    return {
        "items": out,
        "trade_ins": trade_ins,
        "trade_in_total": trade_in_total,
        "credit_applied": credit_applied,
        "available_credit": available_credit,
        "subtotal": round(subtotal, 2),
        "tax": tax_total,
        "tax_jurisdiction_id": jur_id,
        "tax_jurisdiction_name": jur_name,
        "tax_components": tax_components,
        "total": total,
    }


# -----------------------------------------------------------------------------
# Cart Drafts (saved unfinished invoices, scoped per user)
# -----------------------------------------------------------------------------
@api_router.get("/cart-drafts", response_model=List[CartDraft])
async def list_cart_drafts(current: dict = Depends(get_current_user)):
    cursor = db.cart_drafts.find({"created_by": current["id"]}, {"_id": 0}).sort("updated_at", -1)
    return await cursor.to_list(200)


@api_router.post("/cart-drafts", response_model=CartDraft)
async def create_cart_draft(body: CartDraftCreate, current: dict = Depends(get_current_user)):
    name = (body.name or "").strip() or f"Draft {iso(now_utc())[:16]}"
    draft = CartDraft(
        name=name,
        customer_id=body.customer_id,
        items=body.items,
        notes=body.notes,
        created_by=current["id"],
        created_by_name=current.get("name", ""),
    )
    await db.cart_drafts.insert_one(draft.model_dump())
    return draft


@api_router.get("/cart-drafts/{draft_id}", response_model=CartDraft)
async def get_cart_draft(draft_id: str, current: dict = Depends(get_current_user)):
    d = await db.cart_drafts.find_one({"id": draft_id, "created_by": current["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Draft not found")
    return d


@api_router.patch("/cart-drafts/{draft_id}", response_model=CartDraft)
async def update_cart_draft(draft_id: str, body: CartDraftUpdate, current: dict = Depends(get_current_user)):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "items" in update:
        update["items"] = [i if isinstance(i, dict) else i.model_dump() for i in update["items"]]
    update["updated_at"] = iso(now_utc())
    res = await db.cart_drafts.find_one_and_update(
        {"id": draft_id, "created_by": current["id"]},
        {"$set": update},
        return_document=True, projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Draft not found")
    return res


@api_router.delete("/cart-drafts/{draft_id}")
async def delete_cart_draft(draft_id: str, current: dict = Depends(get_current_user)):
    res = await db.cart_drafts.delete_one({"id": draft_id, "created_by": current["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Draft not found")
    return {"ok": True}


# -----------------------------------------------------------------------------
# Health / root
# -----------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"service": "Wholesale POS API", "ok": True}


# -----------------------------------------------------------------------------
# Startup: indexes + seed
# -----------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("sku", unique=True)
    await db.products.create_index("barcode")
    await db.orders.create_index("created_at")
    await db.orders.create_index("customer_id")
    await db.orders.create_index("deleted_at")
    await db.payments.create_index("order_id")
    await db.order_audit.create_index("order_id")
    await db.tax_jurisdictions.create_index("name")
    await db.cart_drafts.create_index("created_by")
    await db.cart_drafts.create_index("updated_at")

    # Backfill: ensure credit_balance + deleted_at fields exist
    await db.customers.update_many({"credit_balance": {"$exists": False}}, {"$set": {"credit_balance": 0.0}})
    await db.customers.update_many({"default_tax_jurisdiction_id": {"$exists": False}}, {"$set": {"default_tax_jurisdiction_id": None}})
    await db.products.update_many({"images": {"$exists": False}}, {"$set": {"images": []}})
    await db.products.update_many({"flavour": {"$exists": False}}, {"$set": {"flavour": ""}})
    await db.products.update_many({"units_per_box": {"$exists": False}}, {"$set": {"units_per_box": 1}})
    await db.orders.update_many({"deleted_at": {"$exists": False}}, {"$set": {"deleted_at": None}})
    await db.orders.update_many({"trade_ins": {"$exists": False}}, {"$set": {"trade_ins": [], "trade_in_total": 0.0, "credit_applied": 0.0}})
    await db.orders.update_many({"agent_can_edit": {"$exists": False}}, {"$set": {"agent_can_edit": False}})
    await db.orders.update_many({"tax_jurisdiction_id": {"$exists": False}}, {"$set": {"tax_jurisdiction_id": None, "tax_jurisdiction_name": "", "tax_components": []}})

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@wholesalepos.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "commission_rate": 0.0,
            "active": True,
            "password_hash": hash_password(admin_password),
            "created_at": iso(now_utc()),
        })
        logger.info("Seeded admin user: %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info("Updated admin password for: %s", admin_email)

    # Seed sample employee + agent for testing if absent
    for email, name, role, rate in [
        ("employee@wholesalepos.com", "Sam Employee", "employee", 0.0),
        ("agent@wholesalepos.com", "Alex Agent", "sales_agent", 5.0),
    ]:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": email,
                "name": name,
                "role": role,
                "commission_rate": rate,
                "active": True,
                "password_hash": hash_password("password123"),
                "created_at": iso(now_utc()),
            })


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# Mount router and CORS
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
