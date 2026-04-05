"""
Управление доменами SpaceRu: сохранение, покупка, верификация, привязка/отвязка.
GET /saved — сохранённые домены
POST /saved — добавить в сохранённые
GET /orders — заказы пользователя
POST /orders — купить домен
POST /orders/connect — привязать домен (API ключ + IP)
POST /orders/dns — этап DNS
POST /orders/connected — завершить подключение
POST /orders/disconnect — отвязать домен
POST /support — форма поддержки
"""
import json
import os
import datetime
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

    # Поддержка — без авторизации
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

    if not token:
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Не авторизован"})}

    conn = get_conn()
    user_id = get_user_id(token, conn)
    if not user_id:
        conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Сессия истекла"})}

    cur = conn.cursor()

    # --- SAVED ---
    if method == "GET" and path == "/saved":
        cur.execute(f"""
            SELECT id, domain_name, extension, price, saved_at
            FROM {SCHEMA}.saved_domains WHERE user_id = %s ORDER BY saved_at DESC
        """, (user_id,))
        rows = cur.fetchall()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps(
            [{"id": r[0], "domain": r[1], "ext": r[2], "price": r[3], "savedAt": str(r[4])} for r in rows]
        )}

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

    # --- ORDERS ---
    if method == "GET" and path == "/orders":
        cur.execute(f"""
            SELECT id, domain_name, extension, price, status, ordered_at, domain_status, verified_at, connected_ip, connection_status
            FROM {SCHEMA}.orders WHERE user_id = %s ORDER BY ordered_at DESC
        """, (user_id,))
        rows = cur.fetchall()

        # Авто-активация: через 30 сек после заказа меняем статус на active
        updates = []
        result = []
        for r in rows:
            ordered_at = r[5]
            domain_status = r[6] or "verifying"
            connection_status = r[9] or "none"

            if domain_status == "verifying" and ordered_at:
                elapsed = (datetime.datetime.utcnow() - ordered_at.replace(tzinfo=None)).total_seconds()
                if elapsed > 30:
                    domain_status = "active"
                    updates.append(r[0])

            result.append({
                "id": r[0], "domain": r[1], "ext": r[2], "price": r[3],
                "status": r[4], "orderedAt": str(r[5]),
                "domainStatus": domain_status,
                "verifiedAt": str(r[7]) if r[7] else None,
                "connectedIp": r[8] or "",
                "connectionStatus": connection_status,
            })

        for oid in updates:
            cur.execute(f"UPDATE {SCHEMA}.orders SET domain_status = 'active', verified_at = NOW() WHERE id = %s", (oid,))
        if updates:
            conn.commit()

        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps(result)}

    if method == "POST" and path == "/orders":
        body = json.loads(event.get("body") or "{}")
        domain = body.get("domain", "").strip().lower()
        ext = body.get("ext", "").strip().lower()
        price = PRICES.get(ext)
        if not domain or not ext or not price:
            conn.close()
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Неверные данные"})}
        cur.execute(
            f"INSERT INTO {SCHEMA}.orders (user_id, domain_name, extension, price, domain_status) VALUES (%s, %s, %s, %s, 'verifying') RETURNING id",
            (user_id, domain, ext, price)
        )
        order_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "orderId": order_id})}

    if method == "POST" and path == "/orders/connect":
        body = json.loads(event.get("body") or "{}")
        order_id = body.get("orderId")
        api_key = body.get("apiKey", "").strip()
        ip_address = body.get("ipAddress", "").strip()
        if not order_id or not api_key or not ip_address:
            conn.close()
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Укажите API ключ и IP адрес"})}
        cur.execute(f"SELECT id FROM {SCHEMA}.orders WHERE id = %s AND user_id = %s", (order_id, user_id))
        if not cur.fetchone():
            conn.close()
            return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Заказ не найден"})}
        cur.execute(f"""
            UPDATE {SCHEMA}.orders
            SET connected_api = %s, connected_ip = %s, connection_status = 'connecting'
            WHERE id = %s
        """, (api_key, ip_address, order_id))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "status": "connecting"})}

    if method == "POST" and path == "/orders/dns":
        body = json.loads(event.get("body") or "{}")
        order_id = body.get("orderId")
        cur.execute(f"SELECT id FROM {SCHEMA}.orders WHERE id = %s AND user_id = %s", (order_id, user_id))
        if not cur.fetchone():
            conn.close()
            return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Заказ не найден"})}
        cur.execute(f"UPDATE {SCHEMA}.orders SET connection_status = 'dns' WHERE id = %s", (order_id,))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "status": "dns"})}

    if method == "POST" and path == "/orders/connected":
        body = json.loads(event.get("body") or "{}")
        order_id = body.get("orderId")
        cur.execute(f"SELECT id FROM {SCHEMA}.orders WHERE id = %s AND user_id = %s", (order_id, user_id))
        if not cur.fetchone():
            conn.close()
            return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Заказ не найден"})}
        cur.execute(f"UPDATE {SCHEMA}.orders SET connection_status = 'connected' WHERE id = %s", (order_id,))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "status": "connected"})}

    if method == "POST" and path == "/orders/disconnect":
        body = json.loads(event.get("body") or "{}")
        order_id = body.get("orderId")
        if not order_id:
            conn.close()
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Укажите orderId"})}
        cur.execute(f"SELECT id FROM {SCHEMA}.orders WHERE id = %s AND user_id = %s", (order_id, user_id))
        if not cur.fetchone():
            conn.close()
            return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Заказ не найден"})}
        cur.execute(f"""
            UPDATE {SCHEMA}.orders
            SET connected_api = '', connected_ip = '', connection_status = 'none'
            WHERE id = %s
        """, (order_id,))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

    conn.close()
    return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Not found"})}
