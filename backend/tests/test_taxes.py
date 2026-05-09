"""Backend tests for Tax Jurisdictions feature."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://checkout-hub-121.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@wholesalepos.com", "password": "admin123"}
EMPLOYEE = {"email": "employee@wholesalepos.com", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin():
    t, u = _login(ADMIN)
    return t, u


@pytest.fixture(scope="module")
def employee():
    t, u = _login(EMPLOYEE)
    return t, u


@pytest.fixture(scope="module")
def karnataka_jurisdiction(admin):
    """Composite: CGST 9% + SGST 9% = 18% total."""
    t, _ = admin
    body = {
        "name": f"TEST_Karnataka_GST_{uuid.uuid4().hex[:6]}",
        "components": [
            {"label": "CGST", "rate": 9.0},
            {"label": "SGST", "rate": 9.0},
        ],
    }
    r = requests.post(f"{API}/tax-jurisdictions", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def alt_jurisdiction(admin):
    """Single 5% rate."""
    t, _ = admin
    body = {"name": f"TEST_Alt5pct_{uuid.uuid4().hex[:6]}", "components": [{"label": "VAT", "rate": 5.0}]}
    r = requests.post(f"{API}/tax-jurisdictions", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def tax_product(admin):
    """A simple no-variant product priced at $100."""
    t, _ = admin
    body = {
        "sku": f"TEST-TAXP-{uuid.uuid4().hex[:6]}",
        "name": "TEST Tax Product",
        "base_price": 100.0,
        "stock": 10000,
    }
    r = requests.post(f"{API}/products", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def tax_customer(admin, karnataka_jurisdiction):
    """Customer with default jurisdiction = karnataka (18%)."""
    t, _ = admin
    body = {
        "name": f"TEST_TaxCust_{uuid.uuid4().hex[:6]}",
        "default_tax_jurisdiction_id": karnataka_jurisdiction["id"],
        "credit_limit": 1000.0,
    }
    r = requests.post(f"{API}/customers", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    return r.json()


# 1. CRUD
class TestTaxJurisdictionCRUD:
    def test_list_includes_created(self, admin, karnataka_jurisdiction):
        t, _ = admin
        r = requests.get(f"{API}/tax-jurisdictions", headers=_h(t))
        assert r.status_code == 200
        ids = [j["id"] for j in r.json()]
        assert karnataka_jurisdiction["id"] in ids

    def test_employee_can_read(self, employee, karnataka_jurisdiction):
        t, _ = employee
        r = requests.get(f"{API}/tax-jurisdictions", headers=_h(t))
        assert r.status_code == 200

    def test_employee_cannot_write(self, employee):
        t, _ = employee
        r = requests.post(f"{API}/tax-jurisdictions", headers=_h(t), json={
            "name": "TEST_Forbidden", "components": [{"label": "X", "rate": 1.0}],
        })
        assert r.status_code == 403

    def test_patch_jurisdiction(self, admin, alt_jurisdiction):
        t, _ = admin
        r = requests.patch(f"{API}/tax-jurisdictions/{alt_jurisdiction['id']}", headers=_h(t), json={
            "components": [{"label": "VAT", "rate": 7.0}],
        })
        assert r.status_code == 200, r.text
        assert r.json()["components"][0]["rate"] == 7.0
        # GET to verify persistence
        r2 = requests.get(f"{API}/tax-jurisdictions", headers=_h(t)).json()
        j = next(x for x in r2 if x["id"] == alt_jurisdiction["id"])
        assert j["components"][0]["rate"] == 7.0

    def test_delete_soft(self, admin):
        t, _ = admin
        # create then delete
        r = requests.post(f"{API}/tax-jurisdictions", headers=_h(t), json={
            "name": f"TEST_ToDelete_{uuid.uuid4().hex[:6]}", "components": [{"label": "Z", "rate": 1.0}]
        })
        jid = r.json()["id"]
        r = requests.delete(f"{API}/tax-jurisdictions/{jid}", headers=_h(t))
        assert r.status_code == 200
        # still in list, but active=False
        all_j = requests.get(f"{API}/tax-jurisdictions", headers=_h(t)).json()
        match = next((x for x in all_j if x["id"] == jid), None)
        assert match is not None
        assert match["active"] is False


# 2. Customer default jurisdiction
class TestCustomerDefaultJurisdiction:
    def test_customer_stores_default(self, tax_customer, karnataka_jurisdiction):
        assert tax_customer["default_tax_jurisdiction_id"] == karnataka_jurisdiction["id"]

    def test_patch_change(self, admin, tax_customer, alt_jurisdiction):
        t, _ = admin
        r = requests.patch(f"{API}/customers/{tax_customer['id']}", headers=_h(t), json={
            "default_tax_jurisdiction_id": alt_jurisdiction["id"],
        })
        assert r.status_code == 200
        assert r.json()["default_tax_jurisdiction_id"] == alt_jurisdiction["id"]

    def test_patch_clear_to_null(self, admin, tax_customer):
        t, _ = admin
        r = requests.patch(f"{API}/customers/{tax_customer['id']}", headers=_h(t), json={
            "default_tax_jurisdiction_id": None,
        })
        assert r.status_code == 200
        assert r.json()["default_tax_jurisdiction_id"] is None

    def test_restore_default_for_subsequent_tests(self, admin, tax_customer, karnataka_jurisdiction):
        # restore so following tests get the karnataka default
        t, _ = admin
        r = requests.patch(f"{API}/customers/{tax_customer['id']}", headers=_h(t), json={
            "default_tax_jurisdiction_id": karnataka_jurisdiction["id"],
        })
        assert r.status_code == 200


# 3. Order create — composite tax & defaults
class TestOrderTaxCompute:
    def test_order_uses_customer_default_18pct(self, admin, tax_customer, tax_product, karnataka_jurisdiction):
        t, _ = admin
        # 2x 100 = $200 subtotal -> CGST 18 + SGST 18 = 36 tax -> total 236
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": tax_customer["id"],
            "items": [{"product_id": tax_product["id"], "quantity": 2}],
            "type": "order",
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert abs(o["subtotal"] - 200.0) < 0.01
        assert abs(o["tax"] - 36.0) < 0.01
        assert abs(o["total"] - 236.0) < 0.01
        assert o["tax_jurisdiction_id"] == karnataka_jurisdiction["id"]
        assert o["tax_jurisdiction_name"] == karnataka_jurisdiction["name"]
        comps = {c["label"]: c for c in o["tax_components"]}
        assert "CGST" in comps and abs(comps["CGST"]["amount"] - 18.0) < 0.01
        assert "SGST" in comps and abs(comps["SGST"]["amount"] - 18.0) < 0.01
        assert abs(comps["CGST"]["rate"] - 9.0) < 0.01

    def test_order_override_with_other_jurisdiction(self, admin, tax_customer, tax_product, alt_jurisdiction):
        t, _ = admin
        # alt_jurisdiction was patched to VAT 7%. $200 * 7% = 14
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": tax_customer["id"],
            "items": [{"product_id": tax_product["id"], "quantity": 2}],
            "type": "order",
            "tax_jurisdiction_id": alt_jurisdiction["id"],
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["tax_jurisdiction_id"] == alt_jurisdiction["id"]
        assert abs(o["tax"] - 14.0) < 0.01
        assert abs(o["total"] - 214.0) < 0.01

    def test_order_explicit_no_tax_empty_string(self, admin, tax_customer, tax_product):
        t, _ = admin
        # customer has default but we explicitly send "" -> no tax
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": tax_customer["id"],
            "items": [{"product_id": tax_product["id"], "quantity": 2}],
            "type": "order",
            "tax_jurisdiction_id": "",
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert abs(o["tax"]) < 0.01
        assert o["tax_components"] == []
        assert abs(o["total"] - 200.0) < 0.01

    def test_order_trade_in_reduces_taxable_base(self, admin, tax_customer, tax_product):
        t, _ = admin
        # subtotal 200 - trade_in 50 = 150 taxable * 18% = 27 tax -> total 177
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": tax_customer["id"],
            "items": [{"product_id": tax_product["id"], "quantity": 2}],
            "trade_ins": [{"description": "TEST trade-in", "quantity": 1, "unit_value": 50.0}],
            "type": "order",
        })
        assert r.status_code == 200, r.text
        o = r.json()
        assert abs(o["trade_in_total"] - 50.0) < 0.01
        assert abs(o["tax"] - 27.0) < 0.01
        assert abs(o["total"] - 177.0) < 0.01

    def test_patch_order_rescales_existing_jurisdiction(self, admin, tax_customer, tax_product):
        t, _ = admin
        # create with qty 2 (200 subtotal, 36 tax)
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": tax_customer["id"],
            "items": [{"product_id": tax_product["id"], "quantity": 2}],
            "type": "order",
        })
        assert r.status_code == 200, r.text
        o = r.json()
        oid = o["id"]
        # patch qty to 3 without sending tax_jurisdiction_id -> rescale: 300 * 18% = 54 tax -> 354
        r2 = requests.patch(f"{API}/orders/{oid}", headers=_h(t), json={
            "items": [{"product_id": tax_product["id"], "quantity": 3}],
        })
        assert r2.status_code == 200, r2.text
        o2 = r2.json()
        assert abs(o2["subtotal"] - 300.0) < 0.01
        assert abs(o2["tax"] - 54.0) < 0.01
        assert abs(o2["total"] - 354.0) < 0.01
        # jurisdiction unchanged
        assert o2["tax_jurisdiction_id"] == o["tax_jurisdiction_id"]

    def test_patch_order_clear_jurisdiction_via_empty_string(self, admin, tax_customer, tax_product):
        t, _ = admin
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": tax_customer["id"],
            "items": [{"product_id": tax_product["id"], "quantity": 1}],
            "type": "order",
        })
        oid = r.json()["id"]
        r2 = requests.patch(f"{API}/orders/{oid}", headers=_h(t), json={
            "tax_jurisdiction_id": "",
        })
        assert r2.status_code == 200, r2.text
        o2 = r2.json()
        assert abs(o2["tax"]) < 0.01
        assert o2["tax_components"] == []
        assert o2["tax_jurisdiction_id"] is None


# 4. Pricing preview
class TestPricingPreview:
    def test_preview_uses_customer_default(self, admin, tax_customer, tax_product):
        t, _ = admin
        r = requests.post(f"{API}/pricing/preview", headers=_h(t), json={
            "customer_id": tax_customer["id"],
            "items": [{"product_id": tax_product["id"], "quantity": 2}],
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert abs(d["tax"] - 36.0) < 0.01
        assert abs(d["total"] - 236.0) < 0.01
        assert len(d["tax_components"]) == 2

    def test_preview_explicit_no_tax(self, admin, tax_customer, tax_product):
        t, _ = admin
        r = requests.post(f"{API}/pricing/preview", headers=_h(t), json={
            "customer_id": tax_customer["id"],
            "items": [{"product_id": tax_product["id"], "quantity": 2}],
            "tax_jurisdiction_id": "",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert abs(d["tax"]) < 0.01
        assert abs(d["total"] - 200.0) < 0.01

    def test_preview_override_alt(self, admin, tax_customer, tax_product, alt_jurisdiction):
        t, _ = admin
        r = requests.post(f"{API}/pricing/preview", headers=_h(t), json={
            "customer_id": tax_customer["id"],
            "items": [{"product_id": tax_product["id"], "quantity": 2}],
            "tax_jurisdiction_id": alt_jurisdiction["id"],
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert abs(d["tax"] - 14.0) < 0.01  # 7% of 200


# 5. Regression — no-tax customer still creates order with tax=0
class TestNoTaxRegression:
    def test_customer_without_default_no_tax(self, admin, tax_product):
        t, _ = admin
        r = requests.post(f"{API}/customers", headers=_h(t), json={
            "name": f"TEST_NoTaxCust_{uuid.uuid4().hex[:6]}", "credit_limit": 100.0,
        })
        cid = r.json()["id"]
        assert r.json().get("default_tax_jurisdiction_id") is None
        r2 = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": cid,
            "items": [{"product_id": tax_product["id"], "quantity": 1}],
            "type": "order",
        })
        assert r2.status_code == 200, r2.text
        o = r2.json()
        assert abs(o["tax"]) < 0.01
        assert o["tax_components"] == []
        assert abs(o["total"] - 100.0) < 0.01
