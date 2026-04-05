
CREATE TABLE t_p18264164_domain_sales_website.users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE t_p18264164_domain_sales_website.sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES t_p18264164_domain_sales_website.users(id),
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
);

CREATE TABLE t_p18264164_domain_sales_website.saved_domains (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES t_p18264164_domain_sales_website.users(id),
  domain_name VARCHAR(255) NOT NULL,
  extension VARCHAR(50) NOT NULL,
  price INTEGER NOT NULL,
  saved_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, domain_name, extension)
);

CREATE TABLE t_p18264164_domain_sales_website.orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES t_p18264164_domain_sales_website.users(id),
  domain_name VARCHAR(255) NOT NULL,
  extension VARCHAR(50) NOT NULL,
  price INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  ordered_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE t_p18264164_domain_sales_website.support_requests (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
