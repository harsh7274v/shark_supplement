# Auth Testing Playbook (JWT + Emergent Google OAuth)

## JWT email/password
1. Register: `curl -c cookies.txt -X POST $API_URL/api/auth/register -H "Content-Type: application/json" -d '{"name":"Test User","email":"test@example.com","password":"secret123"}'` → returns user, sets access_token/refresh_token httpOnly cookies.
2. Login: `curl -c cookies.txt -X POST $API_URL/api/auth/login -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"secret123"}'`
3. Me: `curl -b cookies.txt $API_URL/api/auth/me` → user object.
4. Logout: `curl -b cookies.txt -X POST $API_URL/api/auth/logout` → clears cookies.
5. Refresh: `curl -c cookies.txt -X POST $API_URL/api/auth/refresh -b cookies.txt`
6. Verify bcrypt hash in Mongo: `db.users.findOne({role:"admin"},{password_hash:1})` starts with `$2b$`.
7. Brute force: 5 bad logins → 429 lockout message.

## Emergent Google OAuth
1. Frontend redirects to `https://auth.emergentagent.com/?redirect=<origin + /auth/callback>` (never hardcode, no fallbacks).
2. Callback page reads `#session_id=` from `useLocation().hash`, POSTs it to backend `/api/auth/google/session`.
3. Backend calls `https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data` with `X-Session-ID` header, upserts user (custom `user_id` UUID field), stores session_token with 7-day expiry, sets httpOnly cookie.
4. `/api/auth/me` validates cookie server-side and returns user.
5. All Mongo user queries use `{"_id": 0}` projection; never expose MongoDB `_id`.

