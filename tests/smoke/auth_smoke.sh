#!/bin/bash
# End-to-end auth smoke test. Runs against a live server with a real DB.
# Usage: PORT=8001 ./tests/smoke/auth_smoke.sh
set -u

PORT="${PORT:-8001}"
BASE="http://localhost:${PORT}/api/v1"
KEY=$(grep BENCHMARK_API_KEY .env | cut -d= -f2)

PASS=0
FAIL=0
FAILED_TESTS=()

check() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo "  ✅ $name (got $actual)"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $name (expected $expected, got $actual)"
        FAIL=$((FAIL + 1))
        FAILED_TESTS+=("$name")
    fi
}

# Returns just the HTTP code
http_code() {
    curl -s -o /dev/null -w "%{http_code}" "$@"
}

# Returns body
body() {
    curl -s "$@"
}

# Returns JSON field via python
jq_field() {
    python -c "import sys, json; d=json.load(sys.stdin); print(d.get('$1', ''))"
}

# Purge DB before tests (uses service token)
echo "--- Setting up: purge DB ---"
body -X POST "$BASE/system/purge" -H "Authorization: Bearer $KEY" > /dev/null

# ============================================================================
echo ""
echo "=== Group 1: Health & open endpoints ==="
# ----------------------------------------------------------------------------
check "health endpoint" 200 "$(http_code http://localhost:${PORT}/health)"

# ============================================================================
echo ""
echo "=== Group 2: Registration ==="
# ----------------------------------------------------------------------------
RESP=$(body -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d '{"email":"alice@example.com","password":"pass1234"}')
check "register regular user" "user_" "$(echo $RESP | jq_field user_id | head -c 5)"

CODE=$(http_code -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d '{"email":"alice@example.com","password":"pass1234"}')
check "duplicate email returns 409" 409 "$CODE"

CODE=$(http_code -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d '{"email":"bad","password":"pass1234"}')
check "invalid email returns 422" 422 "$CODE"

CODE=$(http_code -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d '{"email":"short@x.com","password":"abc"}')
check "short password returns 422" 422 "$CODE"

CODE=$(http_code -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d '{"email":"sneaky@x.com","password":"pass1234","is_admin":true}')
check "self-register as admin returns 403" 403 "$CODE"

CODE=$(http_code -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d '{"email":"sneaky@x.com","password":"pass1234","is_sme":true,"sme_id":"sme_xxx"}')
check "self-register as SME returns 403" 403 "$CODE"

# ============================================================================
echo ""
echo "=== Group 3: Login ==="
# ----------------------------------------------------------------------------
RESP=$(body -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d '{"email":"alice@example.com","password":"pass1234"}')
ALICE_JWT=$(echo "$RESP" | jq_field access_token)
check "login returns access_token" "eyJ" "$(echo $ALICE_JWT | head -c 3)"

CODE=$(http_code -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d '{"email":"alice@example.com","password":"WRONG"}')
check "wrong password returns 401" 401 "$CODE"

CODE=$(http_code -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d '{"email":"nobody@example.com","password":"pass1234"}')
check "unknown email returns 401" 401 "$CODE"

# ============================================================================
echo ""
echo "=== Group 4: Token validation ==="
# ----------------------------------------------------------------------------
CODE=$(http_code -X GET "$BASE/auth/me")
check "missing token returns 401" 401 "$CODE"

CODE=$(http_code -X GET "$BASE/auth/me" -H "Authorization: Bearer NOT_A_JWT")
check "garbage token returns 401" 401 "$CODE"

# Tamper: change last char of valid JWT
TAMPERED="${ALICE_JWT%?}X"
CODE=$(http_code -X GET "$BASE/auth/me" -H "Authorization: Bearer $TAMPERED")
check "tampered JWT returns 401" 401 "$CODE"

CODE=$(http_code -X GET "$BASE/auth/me" -H "Authorization: Bearer $ALICE_JWT")
check "valid JWT returns 200" 200 "$CODE"

CODE=$(http_code -X GET "$BASE/auth/me" -H "Authorization: Bearer $KEY")
check "service token returns 200" 200 "$CODE"

# /auth/me with service token returns is_service_token=true
RESP=$(body -X GET "$BASE/auth/me" -H "Authorization: Bearer $KEY")
check "service token user has is_service_token=true" "True" "$(echo $RESP | jq_field is_service_token)"

# ============================================================================
echo ""
echo "=== Group 5: Admin-only endpoints ==="
# ----------------------------------------------------------------------------
# Regular user cannot create SME
CODE=$(http_code -X POST "$BASE/smes" -H "Authorization: Bearer $ALICE_JWT" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","specialization":"X","sub_areas":[],"contact_email":"x@y.com"}')
check "regular user POST /smes returns 403" 403 "$CODE"

# Service token CAN create SME
RESP=$(body -X POST "$BASE/smes" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d '{"name":"SmeX","specialization":"Compliance","sub_areas":["a"],"contact_email":"x@y.com"}')
SME_X=$(echo "$RESP" | jq_field sme_id)
check "service token POST /smes returns sme_id" "sme_" "$(echo $SME_X | head -c 4)"

RESP=$(body -X POST "$BASE/smes" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d '{"name":"SmeY","specialization":"Tribunal","sub_areas":["b"],"contact_email":"y@y.com"}')
SME_Y=$(echo "$RESP" | jq_field sme_id)

# Regular user cannot purge
CODE=$(http_code -X POST "$BASE/system/purge" -H "Authorization: Bearer $ALICE_JWT")
check "regular user POST /system/purge returns 403" 403 "$CODE"

# Regular user cannot reset
CODE=$(http_code -X POST "$BASE/system/reset" -H "Authorization: Bearer $ALICE_JWT")
check "regular user POST /system/reset returns 403" 403 "$CODE"

# ============================================================================
echo ""
echo "=== Group 6: SME-linked user registration & ownership ==="
# ----------------------------------------------------------------------------
# Regular user cannot hit /auth/register/elevated
CODE=$(http_code -X POST "$BASE/auth/register/elevated" -H "Authorization: Bearer $ALICE_JWT" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"sme_x@example.com\",\"password\":\"pass1234\",\"is_sme\":true,\"sme_id\":\"$SME_X\"}")
check "regular user /auth/register/elevated returns 403" 403 "$CODE"

# Service token can create SME-linked user
RESP=$(body -X POST "$BASE/auth/register/elevated" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"sme_x@example.com\",\"password\":\"pass1234\",\"is_sme\":true,\"sme_id\":\"$SME_X\"}")
check "service token creates SME-linked user" "$SME_X" "$(echo $RESP | jq_field sme_id)"

# is_sme=true without sme_id returns 400
CODE=$(http_code -X POST "$BASE/auth/register/elevated" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d '{"email":"bad_sme@example.com","password":"pass1234","is_sme":true}')
check "is_sme=true without sme_id returns 400" 400 "$CODE"

# is_sme=true with non-existent sme_id returns 404
CODE=$(http_code -X POST "$BASE/auth/register/elevated" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d '{"email":"bad_sme@example.com","password":"pass1234","is_sme":true,"sme_id":"sme_nonexistent"}')
check "is_sme=true with non-existent sme_id returns 404" 404 "$CODE"

# Create second SME-linked user
body -X POST "$BASE/auth/register/elevated" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"sme_y@example.com\",\"password\":\"pass1234\",\"is_sme\":true,\"sme_id\":\"$SME_Y\"}" > /dev/null

# Login as SME_X user
SMEX_JWT=$(body -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d '{"email":"sme_x@example.com","password":"pass1234"}' | jq_field access_token)

# Login as SME_Y user
SMEY_JWT=$(body -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d '{"email":"sme_y@example.com","password":"pass1234"}' | jq_field access_token)

# SME_X creates interview on SME_X (own)
RESP=$(body -X POST "$BASE/smes/$SME_X/interviews" -H "Authorization: Bearer $SMEX_JWT" \
    -H "Content-Type: application/json" -d '{"topic":"Test"}')
INT_X=$(echo "$RESP" | jq_field interview_id)
check "SME_X user creates interview on own SME (201)" "int_" "$(echo $INT_X | head -c 4)"

# SME_X tries to create interview on SME_Y
CODE=$(http_code -X POST "$BASE/smes/$SME_Y/interviews" -H "Authorization: Bearer $SMEX_JWT" \
    -H "Content-Type: application/json" -d '{"topic":"Test"}')
check "SME_X user creates interview on SME_Y (403)" 403 "$CODE"

# Admin can create interview on any SME
CODE=$(http_code -X POST "$BASE/smes/$SME_Y/interviews" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" -d '{"topic":"AdminTest"}')
check "service token creates interview on any SME" 201 "$CODE"

# ============================================================================
echo ""
echo "=== Group 7: Interview turn ownership ==="
# ----------------------------------------------------------------------------
# Regular user cannot submit turn (not SME, not admin)
CODE=$(http_code -X POST "$BASE/interviews/$INT_X/turns" -H "Authorization: Bearer $ALICE_JWT" \
    -H "Content-Type: application/json" -d '{"sme_response":"Test response"}')
check "regular user submit_turn returns 403" 403 "$CODE"

# SME_Y user cannot submit turn on SME_X's interview
CODE=$(http_code -X POST "$BASE/interviews/$INT_X/turns" -H "Authorization: Bearer $SMEY_JWT" \
    -H "Content-Type: application/json" -d '{"sme_response":"Test response"}')
check "SME_Y user submit_turn on SME_X interview returns 403" 403 "$CODE"

# Non-existent interview returns 404
CODE=$(http_code -X POST "$BASE/interviews/int_nonexistent/turns" -H "Authorization: Bearer $SMEX_JWT" \
    -H "Content-Type: application/json" -d '{"sme_response":"Test"}')
check "submit_turn on non-existent interview returns 404 (for SME user)" 404 "$CODE"

# ============================================================================
echo ""
echo "=== Group 8: Read endpoints (any logged-in user) ==="
# ----------------------------------------------------------------------------
CODE=$(http_code -X GET "$BASE/smes" -H "Authorization: Bearer $ALICE_JWT")
check "regular user GET /smes returns 200" 200 "$CODE"

CODE=$(http_code -X GET "$BASE/smes/$SME_X" -H "Authorization: Bearer $ALICE_JWT")
check "regular user GET /smes/{id} returns 200" 200 "$CODE"

CODE=$(http_code -X GET "$BASE/smes/$SME_X/interviews" -H "Authorization: Bearer $ALICE_JWT")
check "regular user GET /smes/{id}/interviews returns 200" 200 "$CODE"

CODE=$(http_code -X GET "$BASE/knowledge" -H "Authorization: Bearer $ALICE_JWT")
check "regular user GET /knowledge returns 200" 200 "$CODE"

# ============================================================================
echo ""
echo "=== Group 9: DB CHECK constraint ==="
# ----------------------------------------------------------------------------
# Try to violate is_sme=true ⇒ sme_id NOT NULL via psql inside the container
RAW=$(docker exec -e PGPASSWORD=pass thoth-db psql -U user -d benchmark_db -tA -c \
    "INSERT INTO users (id, email, password_hash, is_admin, is_sme, sme_id) VALUES ('user_test_violate', 'violate@x.com', 'hash', false, true, NULL);" 2>&1)
if echo "$RAW" | grep -q "user_sme_link"; then
    echo "  ✅ DB CHECK constraint blocks is_sme=true with NULL sme_id"
    PASS=$((PASS + 1))
else
    echo "  ❌ DB CHECK constraint test (output: $RAW)"
    FAIL=$((FAIL + 1))
    FAILED_TESTS+=("DB CHECK constraint")
fi

# ============================================================================
echo ""
echo "=== Group 10: JWT payload sanity ==="
# ----------------------------------------------------------------------------
# Decode the SME_X JWT (no verification, just structural)
PAYLOAD=$(echo "$SMEX_JWT" | cut -d. -f2 | python -c "
import sys, base64, json
s = sys.stdin.read().strip()
s += '=' * (-len(s) % 4)
print(json.dumps(json.loads(base64.urlsafe_b64decode(s))))
")
SUB=$(echo "$PAYLOAD" | jq_field sub)
IS_SME=$(echo "$PAYLOAD" | jq_field is_sme)
SME_ID=$(echo "$PAYLOAD" | jq_field sme_id)
check "JWT has user id in sub" "user_" "$(echo $SUB | head -c 5)"
check "JWT has is_sme=True" "True" "$IS_SME"
check "JWT sme_id matches SME_X" "$SME_X" "$SME_ID"

# ============================================================================
echo ""
echo "============================================"
echo "RESULTS: $PASS passed, $FAIL failed"
if [ $FAIL -gt 0 ]; then
    echo ""
    echo "Failed tests:"
    for t in "${FAILED_TESTS[@]}"; do
        echo "  - $t"
    done
    exit 1
fi
exit 0
