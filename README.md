# KINETIC NUTRITION — Premium Gym Supplements Web Store

A full-stack e-commerce web application engineered for high-performance athletic supplements, built with **React**, **Tailwind CSS**, **Framer Motion**, **FastAPI**, and **MongoDB**.

---

## 📁 Project Structure

```
shark_supplement/
├── backend/
│   ├── .env                    # Backend environment config (MongoDB URL, JWT secret, CORS)
│   ├── requirements.txt        # Python backend dependencies (FastAPI, Motor, PyMongo, etc.)
│   └── server.py               # Complete FastAPI API server with auth, products, cart & orders
│
├── frontend/
│   ├── .env                    # Frontend environment config (REACT_APP_BACKEND_URL)
│   ├── package.json            # React frontend dependencies & scripts
│   ├── tailwind.config.js      # Tailwind CSS configuration with Kinetic theme
│   ├── craco.config.js         # CRACO Webpack configuration for `@/` path alias
│   ├── jsconfig.json           # VS Code / IDE path resolution
│   ├── public/
│   │   ├── index.html          # HTML entry with Outfit & Manrope Google Fonts
│   │   └── favicon.svg         # Kinetic Nutrition logo favicon
│   └── src/
│       ├── components/         # Header, Hero, Marquee, Categories, NewArrivals,
│       │                       # ProductCard, ShopSection, CartDrawer, CheckoutModal, AuthModal, Logo
│       ├── context/            # AuthContext (JWT + Google OAuth) & CartContext
│       ├── lib/                # API client with axios, INR formatter, error handler
│       ├── pages/              # Home & AuthCallback (Google OAuth session redirect)
│       ├── App.js              # Main application router with Lenis smooth scroll
│       ├── App.css
│       ├── index.js            # React root with React Query provider
│       └── index.css           # Tailwind layers, scrollbars & Lenis styles
│
├── memory/
│   ├── PRD.md                  # Project requirements & architecture document
│   └── test_credentials.md    # Pre-seeded admin, customer, and coupon credentials
├── design_guidelines.json      # UI/UX design specification & color tokens
├── auth_testing.md             # Playbook for testing JWT and OAuth endpoints
└── README.md
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18+ (v20+ recommended)
- **Python**: 3.9+
- **MongoDB**: Local instance running on `mongodb://localhost:27017` or a MongoDB Atlas connection string.

---

### 2. Backend Setup

1. Open terminal and navigate to `backend/`:
   ```bash
   cd backend
   ```

2. (Optional but recommended) Create and activate a Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```

4. Verify or adjust `backend/.env`:
   ```env
   MONGO_URL="mongodb://localhost:27017"
   DB_NAME="test_database"
   CORS_ORIGINS="http://localhost:3000"
   JWT_SECRET="9f2b7c4e8a1d5f3b6c9e0a2d4f7b1c8e5a3f6d9b2c4e7a1f3d5b8c0e2a4f6d9b"
   ADMIN_EMAIL="admin@kineticnutrition.com"
   ADMIN_PASSWORD="KineticAdmin@2026"
   ```

5. Run the FastAPI development server:
   ```bash
   uvicorn server:app --reload --port 8000
   ```
   *The backend will automatically create indexes and seed sample products, categories, coupons, and the admin account on first startup.*

---

### 3. Frontend Setup

1. Open another terminal and navigate to `frontend/`:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Test Credentials & Promo Codes

### Admin Account (Auto-Seeded)
- **Email**: `admin@kineticnutrition.com`
- **Password**: `KineticAdmin@2026`

### Sample Customer Account
- **Email**: `athlete.test@kineticnutrition.com`
- **Password**: `Test@1234`

### Active Promo Codes
| Code | Discount | Minimum Order |
|---|---|---|
| `KINETIC10` | 10% Off | ₹1,499 |
| `WELCOME15` | 15% Off | ₹1,999 |
| `MUSCLE500` | Flat ₹500 Off | ₹2,999 |

