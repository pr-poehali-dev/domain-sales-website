"""
Регистрация, вход и выход пользователей SpaceRu.
POST /register — создать аккаунт (имя, фамилия, отчество, телефон, email, пароль)
POST /login — войти
POST /logout — выйти
GET / — получить текущего пользователя по токену
"""
import json
import os
import hashlib
import secrets
import psycopg2
import re

SCHEMA = "t_p18264164_domain_sales_website"
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def validate_email(email: str) -> bool:
    return bool(re.match(r'^[^@]+@[^@]+\.[^@]+$', email))

def validate_phone(phone: str) -> bool:
    digits = re.sub(r'\D', '', phone)
    return len(digits) >= 10

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "me")
    headers = event.get("headers", {})
    token = headers.get("X-Auth-Token") or headers.get("x-auth-token")

    if method == "GET" and action == "me":
        if not token:
            return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Не авторизован"})}
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT u.id, u.email, u.name, u.last_name, u.middle_name, u.phone
            FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.token = %s AND s.expires_at > NOW()
        """, (token,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Сессия истекла"})}
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({
            "id": row[0], "email": row[1], "name": row[2],
            "lastName": row[3], "middleName": row[4], "phone": row[5]
        })}

    body = json.loads(event.get("body") or "{}")

    if method == "POST" and action == "register":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        name = body.get("name", "").strip()
        last_name = body.get("lastName", "").strip()
        middle_name = body.get("middleName", "").strip()
        phone = body.get("phone", "").strip()

        if not email or not password or not name or not last_name or not phone:
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Заполните все обязательные поля"})}
        if not validate_email(email):
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Некорректный email"})}
        if len(password) < 6:
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Пароль минимум 6 символов"})}
        if not validate_phone(phone):
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Некорректный номер телефона"})}
        if len(name) < 2:
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Введите настоящее имя"})}
        if len(last_name) < 2:
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Введите настоящую фамилию"})}

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE email = %s", (email,))
        if cur.fetchone():
            conn.close()
            return {"statusCode": 409, "headers": CORS, "body": json.dumps({"error": "Email уже зарегистрирован"})}
        pw_hash = hash_password(password)
        cur.execute(
            f"INSERT INTO {SCHEMA}.users (email, password_hash, name, last_name, middle_name, phone) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (email, pw_hash, name, last_name, middle_name, phone)
        )
        user_id = cur.fetchone()[0]
        tok = secrets.token_hex(32)
        cur.execute(f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES (%s, %s)", (user_id, tok))
        conn.commit()
        conn.close()
        full_name = f"{last_name} {name}"
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({
            "token": tok, "name": name, "lastName": last_name,
            "middleName": middle_name, "phone": phone,
            "email": email, "id": user_id, "fullName": full_name
        })}

    if method == "POST" and action == "login":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        if not email or not password:
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Заполните все поля"})}
        pw_hash = hash_password(password)
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, name, email, last_name, middle_name, phone FROM {SCHEMA}.users WHERE email = %s AND password_hash = %s",
            (email, pw_hash)
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Неверный email или пароль"})}
        tok = secrets.token_hex(32)
        cur.execute(f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES (%s, %s)", (row[0], tok))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({
            "token": tok, "name": row[1], "email": row[2], "id": row[0],
            "lastName": row[3], "middleName": row[4], "phone": row[5]
        })}

    if method == "POST" and action == "logout":
        if token:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute(f"UPDATE {SCHEMA}.sessions SET expires_at = NOW() WHERE token = %s", (token,))
            conn.commit()
            conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

    return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Not found"})}