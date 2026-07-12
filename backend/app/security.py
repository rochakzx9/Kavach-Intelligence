import os
import hashlib
import secrets
import jwt
from datetime import datetime, timedelta
from typing import Optional

# Secret key management
SECRET_KEY = os.getenv("SECRET_KEY", "kavach_default_secure_fallback_key_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

def hash_password(password: str) -> str:
    """
    Hashes a password using PBKDF2-HMAC-SHA256.
    Returns a string in Django/standard format: pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
    """
    salt = secrets.token_hex(16)
    iterations = 100000
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations
    )
    return f"pbkdf2_sha256${iterations}${salt}${key.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against the stored PBKDF2 hash.
    Also falls back to plaintext checks to maintain compatibility with legacy profiles (if any exist).
    """
    if not hashed_password:
        return False
    try:
        # Detect if it's hashed using pbkdf2
        if not hashed_password.startswith("pbkdf2_sha256$"):
            # Plaintext fallback for transition phase
            return plain_password == hashed_password
            
        parts = hashed_password.split("$")
        if len(parts) != 4:
            return False
            
        _, iterations_str, salt, original_hash = parts
        iterations = int(iterations_str)
        key = hashlib.pbkdf2_hmac(
            'sha256',
            plain_password.encode('utf-8'),
            salt.encode('utf-8'),
            iterations
        )
        return secrets.compare_digest(key.hex(), original_hash)
    except Exception:
        return False

def create_access_token(user_id: str, role: str) -> str:
    """
    Creates a cryptographically signed JWT access token.
    To maintain 100% compatibility with the frontend JS, the output is prefixed with 'token-'.
    """
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire.timestamp()
    }
    encoded_jwt = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return f"token-{encoded_jwt}"

def verify_access_token(token: str) -> Optional[dict]:
    """
    Verifies a token starting with 'token-'. Decodes the JWT and validates expiry and signature.
    """
    if not token or not token.startswith("token-"):
        return None
    try:
        raw_jwt = token.replace("token-", "", 1)
        payload = jwt.decode(raw_jwt, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
