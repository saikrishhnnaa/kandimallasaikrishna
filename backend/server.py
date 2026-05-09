from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, status
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

app = FastAPI(title="Wholesale POS API")
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


class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sku: str
    barcode: str = ""
    name: str
    description: str = ""
    category: str = "General"
    unit: str = "pcs"
    base_price: float
    tiers: List[PriceTier] = []
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
    unit: str = "pcs"
    base_price: float
    tiers: List[PriceTier] = []
    stock: int = 0
    low_stock_threshold: int = 10


class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    barcode: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    base_price: Optional[float] = None
    tiers: Optional[List[PriceTier]] = None
    stock: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    active: Optional[bool] = None


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
    credit_limit: float = 0.0
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
    credit_limit: Optional[float] = None
    payment_terms_days: Optional[int] = None
    custom_prices: Optional[List[CustomerPrice]] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class OrderItemIn(BaseModel):
    product_id: str
    quantity: int


class OrderItem(BaseModel):
    product_id: str
    sku: str
    name: str
    quantity: int
    unit_price: float
    line_total: float


OrderType = Literal["quote", "order", "invoice"]
OrderStatus = Literal["draft", "confirmed", "cancelled", "fulfilled"]
PayStatus = Literal["unpaid", "partial", "paid"]


class OrderCreate(BaseModel):
    customer_id: str
    items: List[OrderItemIn]
    type: OrderType = "order"
    notes: str = ""


class OrderOut(BaseModel):
    id: str
    number: str
    type: OrderType
    customer_id: str
    customer_name: str
    items: List[OrderItem]
    subtotal: float
    tax: float
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
async def resolve_price(product: dict, customer: dict, quantity: int) -> float:
    # 1. Customer-specific
    for cp in customer.get("custom_prices", []) or []:
        if cp.get("product_id") == product["id"]:
            return float(cp["price"])
    # 2. Tiered pricing — best matching tier (highest min_qty <= qty)
    best_tier_price = None
    best_tier_qty = -1
    for t in product.get("tiers", []) or []:
        mq = int(t.get("min_qty", 0))
        if quantity >= mq and mq > best_tier_qty:
            best_tier_qty = mq
            best_tier_price = float(t["price"])
    if best_tier_price is not None:
        return best_tier_price
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


@api_router.get("/products/by-barcode/{code}", response_model=Product)
async def get_product_by_barcode(code: str, _: dict = Depends(get_current_user)):
    code = code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Empty barcode")
    # Match either barcode or SKU (USB scanners often hold internal SKUs too)
    p = await db.products.find_one(
        {"$or": [{"barcode": code}, {"sku": code}], "active": True},
        {"_id": 0},
    )
    if not p:
        raise HTTPException(status_code=404, detail=f"No product matches barcode '{code}'")
    return p


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
    update = body.model_dump(exclude_none=True)
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


async def _build_order_doc(body: OrderCreate, current: dict) -> dict:
    customer = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one item required")
    items: List[dict] = []
    subtotal = 0.0
    for it in body.items:
        product = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {it.product_id} not found")
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive")
        unit_price = await resolve_price(product, customer, it.quantity)
        line_total = round(unit_price * it.quantity, 2)
        items.append({
            "product_id": product["id"],
            "sku": product["sku"],
            "name": product["name"],
            "quantity": it.quantity,
            "unit_price": unit_price,
            "line_total": line_total,
        })
        subtotal += line_total
    subtotal = round(subtotal, 2)
    total = subtotal  # no tax for now
    commission_rate = float(current.get("commission_rate") or 0.0) if current["role"] == "sales_agent" else 0.0
    commission = round(total * commission_rate / 100.0, 2)
    terms = int(customer.get("payment_terms_days", 30))
    due_date = iso(now_utc() + timedelta(days=terms)) if body.type == "invoice" else None
    doc = {
        "id": str(uuid.uuid4()),
        "number": await _next_number(_prefix_for(body.type)),
        "type": body.type,
        "customer_id": customer["id"],
        "customer_name": customer.get("company") or customer["name"],
        "items": items,
        "subtotal": subtotal,
        "tax": 0.0,
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
    }
    return doc


async def _decrement_stock(items: List[dict]):
    for it in items:
        await db.products.update_one({"id": it["product_id"]}, {"$inc": {"stock": -int(it["quantity"])}})


@api_router.post("/orders", response_model=OrderOut)
async def create_order(body: OrderCreate, current: dict = Depends(get_current_user)):
    if current["role"] not in ("admin", "employee", "sales_agent"):
        raise HTTPException(status_code=403, detail="Forbidden")
    doc = await _build_order_doc(body, current)
    await db.orders.insert_one(doc)
    if doc["type"] in ("order", "invoice"):
        await _decrement_stock(doc["items"])
    doc.pop("_id", None)
    return doc


def _agent_filter(current: dict) -> dict:
    if current["role"] == "sales_agent":
        return {"created_by": current["id"]}
    return {}


@api_router.get("/orders", response_model=List[OrderOut])
async def list_orders(
    type: Optional[OrderType] = None,
    customer_id: Optional[str] = None,
    current: dict = Depends(get_current_user),
):
    q: dict = _agent_filter(current)
    if type:
        q["type"] = type
    if customer_id:
        q["customer_id"] = customer_id
    cursor = db.orders.find(q, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(2000)


@api_router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: str, current: dict = Depends(get_current_user)):
    q = {"id": order_id, **_agent_filter(current)}
    doc = await db.orders.find_one(q, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    return doc


@api_router.post("/orders/{order_id}/convert", response_model=OrderOut)
async def convert_order(order_id: str, target: OrderType, current: dict = Depends(get_current_user)):
    src = await db.orders.find_one({"id": order_id, **_agent_filter(current)}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Order not found")
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
    if target == "invoice":
        new_doc["balance_due"] = new_doc["total"]
        new_doc["payment_status"] = "unpaid"
        new_doc["amount_paid"] = 0.0
        new_doc["due_date"] = iso(now_utc() + timedelta(days=int(new_doc.get("payment_terms_days", 30))))
    if src["type"] == "quote" and target in ("order", "invoice"):
        await _decrement_stock(new_doc["items"])
    await db.orders.insert_one(new_doc)
    new_doc.pop("_id", None)
    return new_doc


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, _: dict = Depends(require_role("admin"))):
    r = await db.orders.delete_one({"id": order_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"ok": True}


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

    invoices = await db.orders.find({"type": "invoice"}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({"type": "order"}, {"_id": 0}).to_list(5000)

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
        unit = await resolve_price(p, customer, qty)
        line = round(unit * qty, 2)
        subtotal += line
        out.append({
            "product_id": p["id"],
            "sku": p["sku"],
            "name": p["name"],
            "quantity": qty,
            "unit_price": unit,
            "line_total": line,
            "stock": p.get("stock", 0),
        })
    return {"items": out, "subtotal": round(subtotal, 2), "total": round(subtotal, 2)}


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
    await db.payments.create_index("order_id")

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
