import asyncio
import os
import uuid
import logging
import bcrypt
import jwt
import requests
from contextlib import suppress
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Query, HTTPException, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
JWT_SECRET = os.environ.get('JWT_SECRET', 'kinetic_default_secret_key_change_in_production')
JWT_ALGORITHM = "HS256"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------- helpers ----------------


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": now_utc() + timedelta(minutes=15)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": now_utc() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, user_id: str, email: str):
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    response.set_cookie(key="access_token", value=access, httponly=True,
                        secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh, httponly=True,
                        secure=True, samesite="none", max_age=604800, path="/")


def public_user(doc: dict) -> dict:
    return {
        "user_id": doc.get("user_id"),
        "name": doc.get("name"),
        "email": doc.get("email"),
        "picture": doc.get("picture"),
        "role": doc.get("role", "customer"),
        "auth_provider": doc.get("auth_provider", "password"),
    }


async def get_optional_user(request: Request) -> Optional[dict]:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "access" and payload.get("sub"):
                doc = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
                if doc:
                    return doc
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass
    session_token = request.cookies.get("session_token")
    if session_token:
        session = await db.sessions.find_one({"session_token": session_token}, {"_id": 0})
        if session:
            expires_at = session.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if not expires_at or expires_at >= now_utc():
                doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
                if doc:
                    return doc
    return None


async def get_current_user(request: Request) -> dict:
    user = await get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

# ---------------- models ----------------


class RegisterInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str
    password: str = Field(min_length=6, max_length=100)


class LoginInput(BaseModel):
    email: str
    password: str


class ForgotInput(BaseModel):
    email: str


class CouponInput(BaseModel):
    code: str
    subtotal: float = Field(ge=0)


class CheckoutItem(BaseModel):
    product_id: str
    qty: int = Field(ge=1, le=20)
    flavor: Optional[str] = None
    weight: Optional[str] = None


class ShippingInfo(BaseModel):
    full_name: str
    phone: str
    email: str
    address: str
    city: str
    pincode: str


class OrderInput(BaseModel):
    items: List[CheckoutItem]
    coupon_code: Optional[str] = None
    shipping: ShippingInfo
    payment_method: str = "cod"

# ---------------- seed data ----------------

IMG = {
    "whey_isolate": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/ba1969d65080a0e76e0a465b6ae52c296484c52fe4b64e52fa2f84a0334c276a.jpeg",
    "whey_concentrate": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/62de2f6bd0d2149656e697e4f77aca69ec428a13a2b1b17010e98347a198d4e5.jpeg",
    "plant_protein": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/af5e500b579306ef488c0705983d58b735fb2fe9c50fe651d00525e66a8c71ef.jpeg",
    "casein": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/e0ab6ea6207e6cb8b5554d48c4d6ee2f5be38bc1dd46c79251ba85e227e5f2aa.jpeg",
    "mass_gainer": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/60af56ae9b8fe815e74c87492814f8574223b3144d7e8251b0ea31be116e636e.jpeg",
    "lean_gainer": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/94c5f86fc7b54a02df36f9b4b25cc63cb0d2203248c5386e260c1db0636c9a2c.jpeg",
    "pre_workout": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/5296fcdea609266ec71ffa226c0cfe002b39702e7462f9ed3a4506e82fc99b9f.jpeg",
    "creatine": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/919958eeca1c5541ab727b297d4ebec4cb39511d40f81f48e836b77f7b84c3e6.jpeg",
    "eaa": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/2e086af2f2c957497791f03cf1ababce347b1f538670962d343a6ed1f273783f.jpeg",
    "ashwagandha": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/8cec5841d20756d473fb888aeb82a59ff5e150ba51882121846237fc5882ec99.jpeg",
    "shilajit": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/fec0f3b05e04b47b2f5de9ccd55c880406a9c187bdac2ad1939ddc6630908c37.jpeg",
    "peanut_butter": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/659cc228822739e161a012e1ba6b0cfe1ca4d6ee2e3e5a81b0bb24e24f748e53.jpeg",
    "protein_bars": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/19778e88d341c88425607f5351cce596433f4b6824d0d548d395496a6391e692.jpeg",
    "multivitamin": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/71ddf174bcfd2e09cce4e930c70be09bd22b4714f7ea9e409498c7b4ea91d23d.jpeg",
    "omega3": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/95c7f9933c9dbe233b33777692e9c5343080c6023d7875de37dd500b7a5fb4e6.jpeg",
    "fat_burner": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/cca4af3d20a2230202cfeafca4b958a0c1acf594455c3a341de7a43c92742fd6.jpeg",
    "lcarnitine": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/a2231864c485069d7474dd6f5124876868f6e3867318d62717c59713fc485344.jpeg",
    "acv_gummies": "https://static.prod-images.emergentagent.com/jobs/b4b184a7-61cc-48cf-8785-6a97df82610f/images/497093ff2a1a2e00644df3ca2cc0e45653fd84973a3bd3252b4bda3e7fa7155b.jpeg",
}

CATEGORIES = [
    {"slug": "proteins", "name": "Proteins", "image": IMG["whey_isolate"], "tagline": "Whey, isolate & plant protein"},
    {"slug": "gainers", "name": "Gainers", "image": IMG["mass_gainer"], "tagline": "Clean calorie-dense mass"},
    {"slug": "pre_post", "name": "Pre/Post Workout", "image": IMG["pre_workout"], "tagline": "Explosive energy & recovery"},
    {"slug": "ayurveda", "name": "Ayurveda", "image": IMG["ashwagandha"], "tagline": "Ancient herbs, modern labs"},
    {"slug": "fit_foods", "name": "Fit Foods", "image": IMG["peanut_butter"], "tagline": "High-protein everyday snacks"},
    {"slug": "vitamins", "name": "Vitamin Supplements", "image": IMG["multivitamin"], "tagline": "Daily micronutrient cover"},
    {"slug": "fat_loss", "name": "Fat Loss", "image": IMG["fat_burner"], "tagline": "Cut clean, keep the muscle"},
]


def seed_products() -> list:
    def d(days_ago: int) -> str:
        return iso(now_utc() - timedelta(days=days_ago))

    P = [
        ("Kinetic Gold 100% Whey Isolate", "Kinetic", "proteins", 2999, 3999, IMG["whey_isolate"], 4.8, 2314, 4820,
         ["Rich Chocolate", "Vanilla Bean", "Cookies & Cream"], ["1 kg", "2 kg"], "HOT", 12,
         "24g ultra-filtered isolate per scoop, under 1g sugar and instantised for zero-clump mixing."),
        ("Apex Fuel Whey Concentrate", "Apex Fuel", "proteins", 1899, 2599, IMG["whey_concentrate"], 4.6, 1892, 3950,
         ["Chocolate Fudge", "Mocha Coffee"], ["1 kg", "2 kg"], None, 18,
         "Grass-fed concentrate with 24g protein and a rich, milkshake-thick texture."),
        ("Kinetic Plant Protein Isolate", "Kinetic", "proteins", 2499, 2999, IMG["plant_protein"], 4.5, 764, 1240,
         ["Smooth Vanilla", "Dutch Cocoa"], ["800 g"], "NEW", 2,
         "Pea + brown rice blend delivering a complete 25g vegan amino acid profile."),
        ("PureForge Night Casein", "PureForge", "proteins", 2199, 2799, IMG["casein"], 4.7, 589, 980,
         ["Chocolate Supreme"], ["1 kg"], None, 26,
         "Slow-release micellar casein that feeds muscles for up to 7 overnight hours."),
        ("Apex Fuel Serious Mass Gainer", "Apex Fuel", "gainers", 2799, 3499, IMG["mass_gainer"], 4.5, 1540, 3120,
         ["Chocolate", "Banana"], ["3 kg", "5 kg"], None, 15,
         "1250 calorie shakes with 50g protein and complex carbs for hard gainers."),
        ("Kinetic Lean Muscle Gainer", "Kinetic", "gainers", 2499, 2999, IMG["lean_gainer"], 4.4, 432, 860,
         ["Vanilla Almond"], ["2.5 kg"], "NEW", 3,
         "A 2:1 carb-to-protein lean bulk formula with added creatine and digestive enzymes."),
        ("Kinetic Pre-Workout Surge", "Kinetic", "pre_post", 1599, 1999, IMG["pre_workout"], 4.7, 2210, 5230,
         ["Blue Raspberry", "Fruit Punch", "Green Apple"], ["250 g"], "HOT", 8,
         "300mg caffeine, 6g citrulline and 3.2g beta-alanine for skin-splitting pumps."),
        ("PureForge Creatine Monohydrate", "PureForge", "pre_post", 899, 1299, IMG["creatine"], 4.9, 3105, 6840,
         ["Unflavoured"], ["250 g", "500 g"], None, 6,
         "Micronised Creapure-grade monohydrate, third-party tested for purity."),
        ("Apex Fuel EAA Recovery", "Apex Fuel", "pre_post", 1899, 2399, IMG["eaa"], 4.5, 726, 1130,
         ["Watermelon", "Citrus Splash"], ["400 g"], "NEW", 4,
         "All 9 essential amino acids plus electrolytes for intra and post-session recovery."),
        ("NaturaVeda Ashwagandha KSM-66", "NaturaVeda", "ayurveda", 799, 1099, IMG["ashwagandha"], 4.7, 1290, 2610,
         [], ["60 Capsules", "120 Capsules"], None, 10,
         "Clinically dosed KSM-66 root extract to cut cortisol and boost natural strength."),
        ("NaturaVeda Himalayan Shilajit Resin", "NaturaVeda", "ayurveda", 1299, 1799, IMG["shilajit"], 4.6, 855, 1470,
         [], ["20 g"], "NEW", 5,
         "Lab-purified 100% raw Shilajit resin, fulvic acid tested at 68%."),
        ("SwiftFuel High-Protein Peanut Butter", "SwiftFuel", "fit_foods", 499, 649, IMG["peanut_butter"], 4.6, 2043, 4520,
         ["Creamy", "Crunchy", "Dark Chocolate"], ["500 g", "1 kg"], None, 9,
         "1kg of slow-roasted, stone-ground peanut butter with 30g protein per 100g."),
        ("Kinetic Protein Bar Box", "Kinetic", "fit_foods", 1499, 1799, IMG["protein_bars"], 4.4, 687, 1290,
         ["Choco Almond", "Peanut Butter"], ["12 x 60 g"], None, 7,
         "20g protein, under 2g sugar per bar. Box of 12 gym-bag-ready snacks."),
        ("VitaCore Daily Multivitamin", "VitaCore", "vitamins", 699, 999, IMG["multivitamin"], 4.5, 1734, 3980,
         [], ["90 Tablets"], None, 14,
         "42 essential vitamins, minerals and botanicals in one sustained-release tablet."),
        ("VitaCore Omega-3 Fish Oil", "VitaCore", "vitamins", 899, 1199, IMG["omega3"], 4.6, 1120, 2440,
         [], ["60 Softgels"], "NEW", 5,
         "1400mg omega-3 with 660mg EPA and 440mg DHA per serving, mercury tested."),
        ("Kinetic Thermo Burn", "Kinetic", "fat_loss", 1299, 1799, IMG["fat_burner"], 4.3, 940, 1810,
         [], ["90 Capsules"], None, 11,
         "Thermogenic blend of green tea extract, L-theanine and 200mg caffeine."),
        ("Apex Fuel L-Carnitine 3000", "Apex Fuel", "fat_loss", 999, 1399, IMG["lcarnitine"], 4.4, 628, 1150,
         ["Berry Blast"], ["450 ml"], None, 16,
         "3000mg liquid L-carnitine shots that turn stored fat into training fuel."),
        ("PureForge ACV Gummies", "PureForge", "fat_loss", 649, 899, IMG["acv_gummies"], 4.3, 512, 760,
         ["Green Apple"], ["60 Gummies"], None, 20,
         "1000mg apple cider vinegar per serving with the mother, minus the harsh taste."),
    ]
    out = []
    for (name, brand, category, price, mrp, image, rating, reviews, orders,
         flavors, weights, badge, days_ago, desc) in P:
        out.append({
            "id": f"prod_{uuid.uuid4().hex[:12]}",
            "name": name, "brand": brand, "category": category,
            "price": price, "mrp": mrp, "image": image,
            "rating": rating, "reviews_count": reviews, "orders_count": orders,
            "flavors": flavors, "weight_options": weights,
            "badge": badge, "description": desc,
            "in_stock": True, "created_at": d(days_ago),
        })
    return out


COUPONS = [
    {"code": "KINETIC10", "type": "percent", "value": 10, "min_order": 1499, "active": True},
    {"code": "WELCOME15", "type": "percent", "value": 15, "min_order": 1999, "active": True},
    {"code": "MUSCLE500", "type": "flat", "value": 500, "min_order": 2999, "active": True},
]

INDEXES: dict = {
    "users": [IndexModel([("email", ASCENDING)], name="email", unique=True)],
    "products": [
        IndexModel([("category", ASCENDING)], name="category"),
        IndexModel([("orders_count", DESCENDING)], name="orders_desc"),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
}


async def ensure_indexes():
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s): %s", collection, exc)


async def seed_data():
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many(seed_products())
        logger.info("Seeded products")
    if await db.coupons.count_documents({}) == 0:
        await db.coupons.insert_many(COUPONS)
        logger.info("Seeded coupons")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@kineticnutrition.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "KineticAdmin@2026")
    if await db.users.find_one({"email": admin_email}) is None:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin", "role": "admin", "auth_provider": "password",
            "created_at": iso(now_utc()),
        })
        logger.info("Seeded admin user")

# ---------------- app ----------------

app = FastAPI()
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get(
        'CORS_ORIGINS', 'http://localhost:3000').split(',') if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@api_router.get("/")
async def root():
    return {"message": "KINETIC NUTRITION API is live"}


@api_router.get("/categories")
async def get_categories():
    cats = await db.categories.find({}, {"_id": 0}).sort("sort_order", ASCENDING).to_list(20)
    if cats:
        return cats
    with_counts = []
    for c in CATEGORIES:
        count = await db.products.count_documents({"category": c["slug"]})
        with_counts.append({**c, "count": count})
    return with_counts


@api_router.get("/products")
async def get_products(
    category: Optional[str] = None,
    sort: str = Query("most_ordered"),
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
):
    q = {}
    if category and category != "all":
        q["category"] = category
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
        ]
    sort_map = {
        "most_ordered": [("orders_count", DESCENDING)],
        "top_rated": [("rating", DESCENDING)],
        "price_asc": [("price", ASCENDING)],
        "price_desc": [("price", DESCENDING)],
        "newest": [("created_at", DESCENDING)],
    }
    sort_by = sort_map.get(sort, sort_map["most_ordered"])
    docs = await db.products.find(q, {"_id": 0}).sort(sort_by).limit(limit).to_list(limit)
    return docs


@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return doc


@api_router.post("/coupons/validate")
async def validate_coupon(input: CouponInput):
    code = input.code.strip().upper()
    coupon = await db.coupons.find_one({"code": code, "active": True}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=400, detail="Invalid coupon code")
    if input.subtotal < coupon["min_order"]:
        raise HTTPException(
            status_code=400,
            detail=f"Add items worth Rs {int(coupon['min_order'] - input.subtotal)} more to use {code}",
        )
    if coupon["type"] == "percent":
        discount = round(input.subtotal * coupon["value"] / 100)
        label = f"{coupon['value']}% off"
    else:
        discount = coupon["value"]
        label = f"Rs {coupon['value']} off"
    return {"valid": True, "code": code, "discount": discount, "label": label}


@api_router.post("/orders")
async def create_order(input: OrderInput, request: Request):
    if not input.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    items, subtotal = [], 0.0
    for item in input.items:
        prod = await db.products.find_one({"id": item.product_id}, {"_id": 0})
        if not prod:
            raise HTTPException(status_code=400, detail=f"Product {item.product_id} not found")
        line_total = prod["price"] * item.qty
        subtotal += line_total
        items.append({
            "product_id": prod["id"], "name": prod["name"], "brand": prod["brand"],
            "image": prod["image"], "price": prod["price"], "qty": item.qty,
            "flavor": item.flavor, "weight": item.weight,
            "line_total": line_total,
        })
        await db.products.update_one(
            {"id": prod["id"]}, {"$inc": {"orders_count": item.qty}})
    discount = 0
    coupon_code = None
    if input.coupon_code:
        code = input.coupon_code.strip().upper()
        coupon = await db.coupons.find_one({"code": code, "active": True}, {"_id": 0})
        if coupon and subtotal >= coupon["min_order"]:
            discount = round(subtotal * coupon["value"] / 100) if coupon["type"] == "percent" else coupon["value"]
            coupon_code = code
    gst = round((subtotal - discount) * 0.05)
    shipping = 0 if (subtotal - discount) >= 999 else 79
    total = subtotal - discount + gst + shipping
    user = await get_optional_user(request)
    order = {
        "order_id": f"KN{uuid.uuid4().hex[:8].upper()}",
        "user_id": user["user_id"] if user else None,
        "items": items,
        "coupon_code": coupon_code,
        "subtotal": int(subtotal), "discount": int(discount),
        "gst": gst, "shipping": shipping, "total": int(total),
        "payment_method": input.payment_method,
        "shipping_address": input.shipping.model_dump(),
        "status": "Confirmed",
        "created_at": iso(now_utc()),
    }
    await db.orders.insert_one(order)
    order.pop("_id", None)
    return order


@api_router.get("/orders")
async def my_orders(request: Request):
    user = await get_current_user(request)
    docs = await db.orders.find({"user_id": user["user_id"]}, {"_id": 0}) \
        .sort("created_at", DESCENDING).to_list(50)
    return docs


# ---------------- auth ----------------


@api_router.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.strip().lower()
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id, "name": input.name.strip(), "email": email,
        "password_hash": hash_password(input.password), "picture": None,
        "role": "customer", "auth_provider": "password", "created_at": iso(now_utc()),
    }
    await db.users.insert_one(doc)
    set_auth_cookies(response, user_id, email)
    return public_user(doc)


@api_router.post("/auth/login")
async def login(input: LoginInput, request: Request, response: Response):
    email = input.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if attempt:
        locked_until = attempt.get("locked_until")
        if isinstance(locked_until, str):
            locked_until = datetime.fromisoformat(locked_until)
        if locked_until and locked_until.replace(tzinfo=timezone.utc) > now_utc():
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(input.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"updated_at": iso(now_utc())},
             "$setOnInsert": {"locked_until": None}},
            upsert=True,
        )
        if attempt and attempt.get("count", 0) >= 4:
            await db.login_attempts.update_one(
                {"identifier": identifier},
                {"$set": {"locked_until": iso(now_utc() + timedelta(minutes=15))}})
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    set_auth_cookies(response, user["user_id"], user["email"])
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.sessions.delete_one({"session_token": session_token})
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    response.delete_cookie(key="session_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(request: Request):
    user = await get_current_user(request)
    return public_user(user)


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"user_id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        set_auth_cookies(response, user["user_id"], user["email"])
        return public_user(user)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@api_router.post("/auth/forgot-password")
async def forgot_password(input: ForgotInput):
    email = input.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        token = uuid.uuid4().hex + uuid.uuid4().hex
        await db.password_reset_tokens.insert_one({
            "email": email, "token": token,
            "expires_at": iso(now_utc() + timedelta(hours=1)), "used": False,
        })
        logger.info("Password reset link for %s: /reset-password?token=%s", email, token)
    return {"message": "If that email is registered, a reset link is on its way."}


@api_router.post("/auth/google/session")
async def google_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing X-Session-ID header")
    r = await asyncio.to_thread(
        requests.get,
        "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
        headers={"X-Session-ID": session_id}, timeout=15,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Google sign-in session expired. Try again")
    data = r.json()
    email = data["email"].strip().lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing["name"]),
                      "picture": data.get("picture"), "auth_provider": "google"}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        doc = {
            "user_id": user_id, "email": email, "name": data.get("name", "Athlete"),
            "picture": data.get("picture"), "password_hash": None, "role": "customer",
            "auth_provider": "google", "created_at": iso(now_utc()),
        }
        await db.users.insert_one(doc)
    session_token = data["session_token"]
    await db.sessions.update_one(
        {"session_token": session_token},
        {"$set": {"user_id": user_id, "session_token": session_token,
                  "expires_at": iso(now_utc() + timedelta(days=7))}},
        upsert=True,
    )
    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", max_age=604800, path="/")
    return await get_current_user(request) or {}


app.include_router(api_router)


@app.on_event("startup")
async def startup():
    try:
        await ensure_indexes()
        await seed_data()
    except Exception as e:
        logger.error("Startup error: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

