"""Backend tests for Product Images feature."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://checkout-hub-121.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@wholesalepos.com", "password": "admin123"}

# 1x1 transparent PNG data URL (very small valid base64)
TINY_PNG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
TINY_JPG = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD//gATQ3JlYXRlZCB3aXRoIEdJTVD/"
    "2wBDAP//////////////////////////////////////////////////////////////////////"
    "////////////////////////2wBDAf////////////////////////////////////////////////"
    "////////////////////////////////////////wgARCAABAAEDAREAAhEBAxEB/8QAFAABAAAA"
    "AAAAAAAAAAAAAAAACf/EABQBAQAAAAAAAAAAAAAAAAAAAAj/2gAMAwEAAhADEAAAAH8//8QAFBAB"
    "AAAAAAAAAAAAAAAAAAAACf/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAACf/aAAgBAwEB"
    "PwF//8QAFBEBAAAAAAAAAAAAAAAAAAAACf/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAA"
    "Cf/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAACf/aAAgBAQABPyF//9oADAMBAAIAAwAA"
    "ABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAACf/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAA"
    "Cf/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAACf/aAAgBAQABPxB//9k="
)


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


# 1. Create product with images
class TestProductImagesCRUD:
    def test_create_product_with_images(self, admin_token):
        t = admin_token
        body = {
            "sku": f"TEST-IMG-{uuid.uuid4().hex[:6]}",
            "name": "TEST Image Product",
            "base_price": 12.0,
            "stock": 10,
            "images": [
                {"data_url": TINY_PNG, "filename": "primary.png", "is_primary": True},
                {"data_url": TINY_JPG, "filename": "second.jpg", "is_primary": False},
            ],
        }
        r = requests.post(f"{API}/products", headers=_h(t), json=body)
        assert r.status_code == 200, r.text
        p = r.json()
        assert len(p["images"]) == 2
        primary = [i for i in p["images"] if i["is_primary"]]
        assert len(primary) == 1
        assert primary[0]["filename"] == "primary.png"
        for img in p["images"]:
            assert img["data_url"].startswith("data:image/")
            assert "id" in img and img["id"]

        # GET to verify persistence
        r2 = requests.get(f"{API}/products", headers=_h(t))
        match = next((q for q in r2.json() if q["id"] == p["id"]), None)
        assert match is not None
        assert len(match["images"]) == 2
        return p

    def test_patch_product_replaces_images(self, admin_token):
        t = admin_token
        # create
        body = {
            "sku": f"TEST-IMG2-{uuid.uuid4().hex[:6]}",
            "name": "TEST Image Replace",
            "base_price": 5.0,
            "stock": 5,
            "images": [{"data_url": TINY_PNG, "filename": "a.png", "is_primary": True}],
        }
        p = requests.post(f"{API}/products", headers=_h(t), json=body).json()
        assert len(p["images"]) == 1

        # PATCH replace with new list
        new_imgs = [
            {"data_url": TINY_JPG, "filename": "new1.jpg", "is_primary": False},
            {"data_url": TINY_PNG, "filename": "new2.png", "is_primary": True},
        ]
        r = requests.patch(f"{API}/products/{p['id']}", headers=_h(t), json={"images": new_imgs})
        assert r.status_code == 200, r.text
        updated = r.json()
        assert len(updated["images"]) == 2
        filenames = sorted([i["filename"] for i in updated["images"]])
        assert filenames == ["new1.jpg", "new2.png"]
        primary = [i for i in updated["images"] if i["is_primary"]]
        assert len(primary) == 1 and primary[0]["filename"] == "new2.png"

    def test_create_product_no_images_default_empty(self, admin_token):
        t = admin_token
        body = {
            "sku": f"TEST-NOIMG-{uuid.uuid4().hex[:6]}",
            "name": "TEST No Image",
            "base_price": 1.0,
            "stock": 1,
        }
        r = requests.post(f"{API}/products", headers=_h(t), json=body)
        assert r.status_code == 200, r.text
        assert r.json()["images"] == []


# 2. Public catalog (only if PUBLIC_API_KEY is configured)
class TestPublicCatalogImages:
    def test_public_returns_primary_image(self, admin_token):
        t = admin_token
        # Check if public API is configured
        s = requests.get(f"{API}/settings/integration", headers=_h(t))
        if s.status_code != 200 or not s.json().get("public_api_key_set"):
            pytest.skip("PUBLIC_API_KEY not configured")
        api_key = s.json().get("public_api_key")

        body = {
            "sku": f"TEST-PUBIMG-{uuid.uuid4().hex[:6]}",
            "name": "TEST Public Image",
            "base_price": 9.0,
            "stock": 5,
            "images": [
                {"data_url": TINY_PNG, "filename": "p.png", "is_primary": True},
                {"data_url": TINY_JPG, "filename": "s.jpg", "is_primary": False},
            ],
        }
        p = requests.post(f"{API}/products", headers=_h(t), json=body).json()

        r = requests.get(f"{API}/public/products/{p['id']}", headers={"X-API-Key": api_key})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["primary_image"] is not None
        assert d["primary_image"].startswith("data:image/")
        assert isinstance(d["images"], list)
        assert len(d["images"]) == 2
        for url in d["images"]:
            assert url.startswith("data:image/")
