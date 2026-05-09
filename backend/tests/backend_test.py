"""Wholesale POS backend tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://checkout-hub-121.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@wholesalepos.com", "password": "admin123"}
EMP = {"email": "employee@wholesalepos.com", "password": "password123"}
AGENT = {"email": "agent@wholesalepos.com", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_tok():
    t, u = _login(ADMIN)
    return t, u


@pytest.fixture(scope="session")
def emp_tok():
    t, u = _login(EMP)
    return t, u


@pytest.fixture(scope="session")
def agent_tok():
    t, u = _login(AGENT)
    return t, u


# -------------------- AUTH --------------------
class TestAuth:
    def test_login_admin(self):
        t, u = _login(ADMIN)
        assert u["role"] == "admin" and isinstance(t, str) and len(t) > 20

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@y.z", "password": "bad"})
        assert r.status_code == 401

    def test_me_with_token(self, admin_tok):
        t, _ = admin_tok
        r = requests.get(f"{API}/auth/me", headers=_h(t))
        assert r.status_code == 200 and r.json()["email"] == ADMIN["email"]

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# -------------------- USERS --------------------
class TestUsers:
    def test_list_users_admin(self, admin_tok):
        t, _ = admin_tok
        r = requests.get(f"{API}/users", headers=_h(t))
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_list_users_forbidden_employee(self, emp_tok):
        t, _ = emp_tok
        r = requests.get(f"{API}/users", headers=_h(t))
        assert r.status_code == 403

    def test_list_users_forbidden_agent(self, agent_tok):
        t, _ = agent_tok
        r = requests.get(f"{API}/users", headers=_h(t))
        assert r.status_code == 403

    def test_user_crud(self, admin_tok):
        t, _ = admin_tok
        email = f"TEST_user_{uuid.uuid4().hex[:6]}@x.com"
        r = requests.post(f"{API}/users", headers=_h(t), json={
            "email": email, "password": "pw12345", "name": "TEST U", "role": "employee"
        })
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        r = requests.patch(f"{API}/users/{uid}", headers=_h(t), json={"name": "TEST U2"})
        assert r.status_code == 200 and r.json()["name"] == "TEST U2"
        r = requests.delete(f"{API}/users/{uid}", headers=_h(t))
        assert r.status_code == 200


# -------------------- PRODUCTS --------------------
@pytest.fixture(scope="session")
def sample_product(admin_tok):
    t, _ = admin_tok
    sku = f"TEST-SKU-{uuid.uuid4().hex[:6]}"
    body = {
        "sku": sku, "name": "TEST Widget", "base_price": 50.0,
        "tiers": [{"min_qty": 10, "price": 45.0}, {"min_qty": 50, "price": 40.0}],
        "stock": 200, "low_stock_threshold": 20,
    }
    r = requests.post(f"{API}/products", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    return r.json()


class TestProducts:
    def test_create_and_list(self, admin_tok, sample_product):
        t, _ = admin_tok
        r = requests.get(f"{API}/products", headers=_h(t))
        assert r.status_code == 200
        assert any(p["id"] == sample_product["id"] for p in r.json())

    def test_sku_unique(self, admin_tok, sample_product):
        t, _ = admin_tok
        r = requests.post(f"{API}/products", headers=_h(t), json={
            "sku": sample_product["sku"], "name": "dup", "base_price": 1.0
        })
        assert r.status_code == 400

    def test_update(self, admin_tok, sample_product):
        t, _ = admin_tok
        r = requests.patch(f"{API}/products/{sample_product['id']}", headers=_h(t),
                           json={"stock": 500})
        assert r.status_code == 200 and r.json()["stock"] == 500


# -------------------- CUSTOMERS --------------------
@pytest.fixture(scope="session")
def sample_customer(admin_tok, sample_product):
    t, _ = admin_tok
    body = {
        "name": f"TEST Cust {uuid.uuid4().hex[:6]}",
        "company": "TEST Co", "payment_terms_days": 30, "credit_limit": 5000,
        "custom_prices": [],
    }
    r = requests.post(f"{API}/customers", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def custom_priced_customer(admin_tok, sample_product):
    t, _ = admin_tok
    body = {
        "name": f"TEST CP {uuid.uuid4().hex[:6]}",
        "payment_terms_days": 15,
        "custom_prices": [{"product_id": sample_product["id"], "price": 30.0}],
    }
    r = requests.post(f"{API}/customers", headers=_h(t), json=body)
    assert r.status_code == 200
    return r.json()


class TestCustomers:
    def test_list(self, admin_tok, sample_customer):
        t, _ = admin_tok
        r = requests.get(f"{API}/customers", headers=_h(t))
        assert r.status_code == 200
        assert any(c["id"] == sample_customer["id"] for c in r.json())

    def test_update(self, admin_tok, sample_customer):
        t, _ = admin_tok
        r = requests.patch(f"{API}/customers/{sample_customer['id']}", headers=_h(t),
                           json={"phone": "555-1234"})
        assert r.status_code == 200 and r.json()["phone"] == "555-1234"


# -------------------- ORDERS / PRICING --------------------
class TestOrdersPricing:
    def test_tiered_pricing(self, admin_tok, sample_customer, sample_product):
        t, _ = admin_tok
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": sample_customer["id"],
            "items": [{"product_id": sample_product["id"], "quantity": 15}],
            "type": "order",
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["items"][0]["unit_price"] == 45.0
        assert o["total"] == 675.0
        assert o["status"] == "confirmed"

    def test_custom_price_overrides_tier(self, admin_tok, custom_priced_customer, sample_product):
        t, _ = admin_tok
        r = requests.post(f"{API}/pricing/preview", headers=_h(t), json={
            "customer_id": custom_priced_customer["id"],
            "items": [{"product_id": sample_product["id"], "quantity": 50}],
        })
        assert r.status_code == 200
        assert r.json()["items"][0]["unit_price"] == 30.0

    def test_quote_no_stock_decrement(self, admin_tok, sample_customer, sample_product):
        t, _ = admin_tok
        before = requests.get(f"{API}/products", headers=_h(t)).json()
        before_stock = next(p["stock"] for p in before if p["id"] == sample_product["id"])
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": sample_customer["id"],
            "items": [{"product_id": sample_product["id"], "quantity": 5}],
            "type": "quote",
        })
        assert r.status_code == 200 and r.json()["status"] == "draft"
        after = requests.get(f"{API}/products", headers=_h(t)).json()
        after_stock = next(p["stock"] for p in after if p["id"] == sample_product["id"])
        assert after_stock == before_stock

    def test_invoice_sets_balance_due(self, admin_tok, sample_customer, sample_product):
        t, _ = admin_tok
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": sample_customer["id"],
            "items": [{"product_id": sample_product["id"], "quantity": 2}],
            "type": "invoice",
        })
        assert r.status_code == 200
        o = r.json()
        assert o["balance_due"] == o["total"] and o["due_date"]

    def test_convert_quote_to_invoice(self, admin_tok, sample_customer, sample_product):
        t, _ = admin_tok
        q = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": sample_customer["id"],
            "items": [{"product_id": sample_product["id"], "quantity": 3}],
            "type": "quote",
        }).json()
        r = requests.post(f"{API}/orders/{q['id']}/convert?target=invoice", headers=_h(t))
        assert r.status_code == 200 and r.json()["type"] == "invoice"
        # cannot reconvert invoice
        inv_id = r.json()["id"]
        r2 = requests.post(f"{API}/orders/{inv_id}/convert?target=order", headers=_h(t))
        assert r2.status_code == 400

    def test_agent_commission_and_isolation(self, agent_tok, sample_customer, sample_product):
        t, u = agent_tok
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": sample_customer["id"],
            "items": [{"product_id": sample_product["id"], "quantity": 20}],  # 20*45=900
            "type": "order",
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["agent_commission_rate"] == 5.0
        assert abs(o["agent_commission"] - round(o["total"] * 0.05, 2)) < 0.01
        # agent only sees own
        lst = requests.get(f"{API}/orders", headers=_h(t)).json()
        assert all(x["created_by"] == u["id"] for x in lst)


# -------------------- PAYMENTS --------------------
class TestPayments:
    def test_payment_only_invoice(self, admin_tok, sample_customer, sample_product):
        t, _ = admin_tok
        order = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": sample_customer["id"],
            "items": [{"product_id": sample_product["id"], "quantity": 2}],
            "type": "order",
        }).json()
        r = requests.post(f"{API}/payments", headers=_h(t), json={
            "order_id": order["id"], "amount": 10, "method": "cash"
        })
        assert r.status_code == 400

    def test_payment_partial_then_paid(self, admin_tok, sample_customer, sample_product):
        t, _ = admin_tok
        inv = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": sample_customer["id"],
            "items": [{"product_id": sample_product["id"], "quantity": 4}],  # 4*50=200
            "type": "invoice",
        }).json()
        total = inv["total"]
        r = requests.post(f"{API}/payments", headers=_h(t), json={
            "order_id": inv["id"], "amount": total / 2, "method": "bank_transfer"
        })
        assert r.status_code == 200
        o = requests.get(f"{API}/orders/{inv['id']}", headers=_h(t)).json()
        assert o["payment_status"] == "partial"
        # exceed
        r2 = requests.post(f"{API}/payments", headers=_h(t), json={
            "order_id": inv["id"], "amount": total, "method": "cash"
        })
        assert r2.status_code == 400
        # finish
        r3 = requests.post(f"{API}/payments", headers=_h(t), json={
            "order_id": inv["id"], "amount": total / 2, "method": "cheque"
        })
        assert r3.status_code == 200
        o2 = requests.get(f"{API}/orders/{inv['id']}", headers=_h(t)).json()
        assert o2["payment_status"] == "paid" and o2["balance_due"] == 0.0


# -------------------- DASHBOARD --------------------
class TestDashboard:
    def test_admin_stats(self, admin_tok):
        t, _ = admin_tok
        r = requests.get(f"{API}/dashboard/stats", headers=_h(t))
        assert r.status_code == 200
        d = r.json()
        for k in ["total_revenue", "outstanding", "revenue_series", "top_products", "agents", "low_stock"]:
            assert k in d
        assert len(d["revenue_series"]) == 7

    def test_agent_forbidden_admin_stats(self, agent_tok):
        t, _ = agent_tok
        r = requests.get(f"{API}/dashboard/stats", headers=_h(t))
        assert r.status_code == 403

    def test_agent_stats(self, agent_tok):
        t, _ = agent_tok
        r = requests.get(f"{API}/agent/stats", headers=_h(t))
        assert r.status_code == 200
        d = r.json()
        for k in ["total_revenue", "total_commission", "commission_rate", "recent"]:
            assert k in d
