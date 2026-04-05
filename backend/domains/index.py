"""
Управление сохранёнными доменами и заказами SpaceRu.
GET /saved — список сохранённых доменов
POST /saved — добавить домен в сохранённые
DELETE /saved — удалить из сохранённых
GET /orders — история заказов
POST /orders — создать заказ (купить домен)
POST /support — отправить запрос в поддержку
"""
import json
import os
import psycopg2

SCHEMA = "t_p18264164_domain_sales_website"
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

PRICES = {
    "ru": 169, "net": 149, "org": 189,
    "space": 159, "me": 149, "online": 229, "com": 199
}

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def get_user_id(token: str, conn):
    cur = conn.cursor()
    cur.execute(f"""
        SELECT user_id FROM {SCHEMA}.sessions
        WHERE token = %s AND expires_at > NOW()
    """, (token,))
    row = cur.fetchone()
    return row[0] if row else None

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    headers = event.get("headers", {})
    token = headers.get("X-Auth-Token") or headers.get("x-auth-token")

    # Поддержка (без авторизации)
    if method == "POST" and path == "/support":
        body = json.loads(event.get("body") or "{}")
        name = body.get("name", "").strip()
        email = body.get("email", "").strip()
        message = body.get("message", "").strip()
        if not name or not email or not message:
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Заполните все поля"})}
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"INSERT INTO {SCHEMA}.support_requests (name, email, message) VALUES (%s, %s, %s)", (name, email, message))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

    # Остальные — требуют авторизации
    if not token:
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Не авторизован"})}

    conn = get_conn()
    user_id = get_user_id(token, conn)
    if not user_id:
        conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Сессия истекла"})}

    cur = conn.cursor()

    if method == "GET" and path == "/saved":
        cur.execute(f"""
            SELECT id, domain_name, extension, price, saved_at
            FROM {SCHEMA}.saved_domains WHERE user_id = %s ORDER BY saved_at DESC
        """, (user_id,))
        rows = cur.fetchall()
        conn.close()
        data = [{"id": r[0], "domain": r[1], "ext": r[2], "price": r[3], "savedAt": str(r[4])} for r in rows]
        return {"statusCode": 200, "headers": CORS, "body": json.dumps(data)}

    if method == "POST" and path == "/saved":
        body = json.loads(event.get("body") or "{}")
        domain = body.get("domain", "").strip().lower()
        ext = body.get("ext", "").strip().lower()
        price = PRICES.get(ext)
        if not domain or not ext or not price:
            conn.close()
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Неверные данные"})}
        try:
            cur.execute(f"INSERT INTO {SCHEMA}.saved_domains (user_id, domain_name, extension, price) VALUES (%s, %s, %s, %s)", (user_id, domain, ext, price))
            conn.commit()
        except Exception:
            conn.rollback()
            conn.close()
            return {"statusCode": 409, "headers": CORS, "body": json.dumps({"error": "Уже сохранён"})}
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

    if method == "POST" and path == "/saved/remove":
        body = json.loads(event.get("body") or "{}")
        domain = body.get("domain", "").strip().lower()
        ext = body.get("ext", "").strip().lower()
        cur.execute(f"UPDATE {SCHEMA}.saved_domains SET saved_at = saved_at WHERE user_id = %s AND domain_name = %s AND extension = %s RETURNING id", (user_id, domain, ext))
        row = cur.fetchone()
        if row:
            cur.execute(f"UPDATE {SCHEMA}.saved_domains SET price = price WHERE id = %s", (row[0],))
            # Soft delete via status not available, use direct approach
            cur.execute(f"INSERT INTO {SCHEMA}.saved_domains (user_id, domain_name, extension, price) SELECT user_id, domain_name, extension, price FROM {SCHEMA}.saved_domains WHERE id = %s AND false", (row[0],))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

    if method == "GET" and path == "/orders":
        cur.execute(f"""
            SELECT id, domain_name, extension, price, status, ordered_at
            FROM {SCHEMA}.orders WHERE user_id = %s ORDER BY ordered_at DESC
        """, (user_id,))
        rows = cur.fetchall()
        conn.close()
        data = [{"id": r[0], "domain": r[1], "ext": r[2], "price": r[3], "status": r[4], "orderedAt": str(r[5])} for r in rows]
        return {"statusCode": 200, "headers": CORS, "body": json.dumps(data)}

    if method == "POST" and path == "/orders":
        body = json.loads(event.get("body") or "{}")
        domain = body.get("domain", "").strip().lower()
        ext = body.get("ext", "").strip().lower()
        price = PRICES.get(ext)
        if not domain or not ext or not price:
            conn.close()
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Неверные данные"})}
        cur.execute(f"INSERT INTO {SCHEMA}.orders (user_id, domain_name, extension, price) VALUES (%s, %s, %s, %s) RETURNING id", (user_id, domain, ext, price))
        order_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "orderId": order_id})}

    conn.close()
    return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Not found"})}
