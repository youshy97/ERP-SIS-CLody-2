-- Seed an initial admin user (password: Admin@12345 -- CHANGE THIS after first login)
-- Password hash below is a bcrypt hash generated for 'Admin@12345'
INSERT INTO users (full_name, email, password_hash, role)
VALUES ('System Admin', 'admin@erp.local', '$2a$10$bocmNAwj96uuDd0t/IjWYe6WwXMdlwFDLP8M/2/0sQ6ZvFzkZ3qNO', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO customers (customer_name, contact_person, contact_email, contact_phone)
VALUES ('Demo Customer LLC', 'John Doe', 'john@democustomer.com', '+964-000-0000')
ON CONFLICT DO NOTHING;
