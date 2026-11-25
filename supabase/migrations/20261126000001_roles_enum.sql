-- New roles. Kept in their own migration: Postgres can't use a new enum value
-- in the same transaction that adds it.
--   dispatch  - TMS only, loads assigned to them
--   customer  - customer portal only, their own company's loads and invoices
alter type public.app_role add value if not exists 'dispatch';
alter type public.app_role add value if not exists 'customer';
