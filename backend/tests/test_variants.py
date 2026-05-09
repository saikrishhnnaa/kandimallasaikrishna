"""Backend tests for Product Variants feature."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://checkout-hub-121.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@wholesalepos.com", "password": "admin123"}


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
def customer(admin):
    t, _ = admin
    body = {"name": f"TEST VarCust {uuid.uuid4().hex[:6]}", "payment_terms_days": 30}
    r = requests.post(f"{API}/customers", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def variant_product(admin):
    """Create a product with two variants."""
    t, _ = admin
    sku = f"TEST-VPROD-{uuid.uuid4().hex[:6]}"
    body = {
        "sku": sku,
        "name": "TEST Premium Cola",
        "base_price": 5.0,
        "tiers": [{"min_qty": 10, "price": 4.5}],
        "stock": 0,
        "variants": [
            {
                "label": "1 L",
                "sku": f"TEST-V1L-{uuid.uuid4().hex[:6]}",
                "barcode": f"BAR-1L-{uuid.uuid4().hex[:8]}",
                "price": 3.50,
                "stock": 100,
                "low_stock_threshold": 5,
                "active": True,
            },
            {
                "label": "2 L",
                "sku": f"TEST-V2L-{uuid.uuid4().hex[:6]}",
                "barcode": f"BAR-2L-{uuid.uuid4().hex[:8]}",
                "price": 6.50,
                "stock": 50,
                "low_stock_threshold": 5,
                "active": True,
            },
        ],
    }
    r = requests.post(f"{API}/products", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def plain_product(admin):
    """Plain product without variants for regression."""
    t, _ = admin
    sku = f"TEST-PPROD-{uuid.uuid4().hex[:6]}"
    body = {"sku": sku, "name": "TEST Plain Item", "base_price": 10.0, "stock": 100}
    r = requests.post(f"{API}/products", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    return r.json()


# 1. Create + list with variants
class TestProductVariantsCRUD:
    def test_create_returns_variants(self, variant_product):
        assert len(variant_product["variants"]) == 2
        labels = [v["label"] for v in variant_product["variants"]]
        assert "1 L" in labels and "2 L" in labels
        for v in variant_product["variants"]:
            assert "id" in v and v["id"]
            assert "price" in v and "stock" in v

    def test_list_includes_variants(self, admin, variant_product):
        t, _ = admin
        r = requests.get(f"{API}/products", headers=_h(t))
        assert r.status_code == 200
        p = next((p for p in r.json() if p["id"] == variant_product["id"]), None)
        assert p is not None
        assert len(p["variants"]) == 2


# 2. by-barcode lookup
class TestByBarcode:
    def test_match_variant_barcode(self, admin, variant_product):
        t, _ = admin
        v1 = variant_product["variants"][0]
        r = requests.get(f"{API}/products/by-barcode/{v1['barcode']}", headers=_h(t))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["product"]["id"] == variant_product["id"]
        assert body["variant"] is not None
        assert body["variant"]["id"] == v1["id"]

    def test_match_variant_sku(self, admin, variant_product):
        t, _ = admin
        v2 = variant_product["variants"][1]
        r = requests.get(f"{API}/products/by-barcode/{v2['sku']}", headers=_h(t))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["variant"]["id"] == v2["id"]

    def test_match_parent_sku_no_variant(self, admin, plain_product):
        t, _ = admin
        r = requests.get(f"{API}/products/by-barcode/{plain_product['sku']}", headers=_h(t))
        assert r.status_code == 200
        body = r.json()
        assert body["product"]["id"] == plain_product["id"]
        assert body["variant"] is None


# 3. Order create — variant required
class TestOrderVariantRequired:
    def test_missing_variant_id_400(self, admin, customer, variant_product):
        t, _ = admin
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": customer["id"],
            "items": [{"product_id": variant_product["id"], "quantity": 2}],
            "type": "order",
        })
        assert r.status_code == 400
        assert "variants" in r.text.lower() or "choose" in r.text.lower()

    def test_invalid_variant_id_400(self, admin, customer, variant_product):
        t, _ = admin
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": customer["id"],
            "items": [{"product_id": variant_product["id"], "variant_id": "bogus", "quantity": 1}],
            "type": "order",
        })
        assert r.status_code == 400


# 4. Order create with variant — uses variant price + decrement variant stock
class TestOrderWithVariant:
    def test_variant_order_uses_variant_price_and_decrements(self, admin, customer, variant_product):
        t, _ = admin
        v1 = variant_product["variants"][0]  # 1L @ 3.50, stock 100
        # snapshot
        r0 = requests.get(f"{API}/products", headers=_h(t)).json()
        p0 = next(p for p in r0 if p["id"] == variant_product["id"])
        v0 = next(v for v in p0["variants"] if v["id"] == v1["id"])
        before_v_stock = int(v0["stock"])
        before_p_stock = int(p0.get("stock", 0))

        qty = 3
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": customer["id"],
            "items": [{"product_id": variant_product["id"], "variant_id": v1["id"], "quantity": qty}],
            "type": "order",
        })
        assert r.status_code == 200, r.text
        o = r.json()
        line = o["items"][0]
        assert line["variant_id"] == v1["id"]
        assert line["variant_label"] == v1["label"]
        assert abs(line["unit_price"] - v1["price"]) < 0.01
        assert abs(o["total"] - qty * v1["price"]) < 0.01

        # verify variant stock decremented, parent untouched
        r1 = requests.get(f"{API}/products", headers=_h(t)).json()
        p1 = next(p for p in r1 if p["id"] == variant_product["id"])
        v1_after = next(v for v in p1["variants"] if v["id"] == v1["id"])
        assert int(v1_after["stock"]) == before_v_stock - qty
        assert int(p1.get("stock", 0)) == before_p_stock

    def test_tier_pricing_does_not_apply_under_min(self, admin, customer, variant_product):
        # tier kicks in at qty 10. variant price 6.50 should be used for qty 2.
        t, _ = admin
        v2 = variant_product["variants"][1]
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": customer["id"],
            "items": [{"product_id": variant_product["id"], "variant_id": v2["id"], "quantity": 2}],
            "type": "order",
        })
        assert r.status_code == 200, r.text
        line = r.json()["items"][0]
        assert abs(line["unit_price"] - v2["price"]) < 0.01

    def test_tier_pricing_overrides_variant_when_qty_meets_min(self, admin, customer, variant_product):
        # tiered 4.5 @ qty>=10. Tier is parent-level and overrides variant base.
        t, _ = admin
        v1 = variant_product["variants"][0]
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": customer["id"],
            "items": [{"product_id": variant_product["id"], "variant_id": v1["id"], "quantity": 12}],
            "type": "order",
        })
        assert r.status_code == 200, r.text
        line = r.json()["items"][0]
        assert abs(line["unit_price"] - 4.5) < 0.01


# 5. Out-of-stock guard
class TestVariantOutOfStock:
    def test_oos_message_with_variant_label(self, admin, customer, variant_product):
        t, _ = admin
        v1 = variant_product["variants"][0]
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": customer["id"],
            "items": [{"product_id": variant_product["id"], "variant_id": v1["id"], "quantity": 999999}],
            "type": "order",
        })
        assert r.status_code == 400
        msg = r.text
        assert v1["label"] in msg
        assert "have" in msg and "need" in msg


# 6. Soft-delete restores variant stock; restore re-decrements
class TestVariantDeleteRestore:
    def test_delete_restores_then_restore_redecrements(self, admin, customer, variant_product):
        t, _ = admin
        v1 = variant_product["variants"][0]

        def vstock():
            r = requests.get(f"{API}/products", headers=_h(t)).json()
            p = next(p for p in r if p["id"] == variant_product["id"])
            return int(next(v for v in p["variants"] if v["id"] == v1["id"])["stock"])

        before = vstock()
        qty = 4
        o = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": customer["id"],
            "items": [{"product_id": variant_product["id"], "variant_id": v1["id"], "quantity": qty}],
            "type": "order",
        }).json()
        assert vstock() == before - qty

        # delete
        r = requests.delete(f"{API}/orders/{o['id']}", headers=_h(t))
        assert r.status_code == 200, r.text
        assert vstock() == before

        # restore
        r = requests.post(f"{API}/orders/{o['id']}/restore", headers=_h(t))
        assert r.status_code == 200, r.text
        assert vstock() == before - qty


# 7. Patch order qty reconciles variant stock
class TestVariantOrderPatch:
    def test_patch_qty_reconciles_variant_stock(self, admin, customer, variant_product):
        t, _ = admin
        v2 = variant_product["variants"][1]

        def vstock():
            r = requests.get(f"{API}/products", headers=_h(t)).json()
            p = next(p for p in r if p["id"] == variant_product["id"])
            return int(next(v for v in p["variants"] if v["id"] == v2["id"])["stock"])

        before = vstock()
        o = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": customer["id"],
            "items": [{"product_id": variant_product["id"], "variant_id": v2["id"], "quantity": 3}],
            "type": "order",
        }).json()
        assert vstock() == before - 3

        # patch up to qty 5 (delta -2)
        r = requests.patch(f"{API}/orders/{o['id']}", headers=_h(t), json={
            "items": [{"product_id": variant_product["id"], "variant_id": v2["id"], "quantity": 5}],
        })
        assert r.status_code == 200, r.text
        assert vstock() == before - 5

        # patch back to qty 1 (delta +4)
        r = requests.patch(f"{API}/orders/{o['id']}", headers=_h(t), json={
            "items": [{"product_id": variant_product["id"], "variant_id": v2["id"], "quantity": 1}],
        })
        assert r.status_code == 200, r.text
        assert vstock() == before - 1


# 8. Regression — products without variants still work
class TestPlainProductRegression:
    def test_order_without_variant_id_works(self, admin, customer, plain_product):
        t, _ = admin
        r = requests.post(f"{API}/orders", headers=_h(t), json={
            "customer_id": customer["id"],
            "items": [{"product_id": plain_product["id"], "quantity": 2}],
            "type": "order",
        })
        assert r.status_code == 200, r.text
        line = r.json()["items"][0]
        assert line.get("variant_id") in (None, "", )
        assert line.get("variant_label", "") == ""
        assert abs(line["unit_price"] - plain_product["base_price"]) < 0.01
