#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE cardo_customer LOGIN PASSWORD 'cardo_customer_dev';
CREATE ROLE cardo_banking LOGIN PASSWORD 'cardo_banking_dev';
CREATE ROLE cardo_engagement LOGIN PASSWORD 'cardo_engagement_dev';
CREATE ROLE cardo_qa LOGIN PASSWORD 'cardo_qa_dev';
CREATE SCHEMA customer AUTHORIZATION cardo_customer;
CREATE SCHEMA banking AUTHORIZATION cardo_banking;
CREATE SCHEMA engagement AUTHORIZATION cardo_engagement;
GRANT USAGE ON SCHEMA customer,banking,engagement TO cardo_qa;
ALTER DEFAULT PRIVILEGES FOR ROLE cardo_customer IN SCHEMA customer GRANT SELECT ON TABLES TO cardo_qa;
ALTER DEFAULT PRIVILEGES FOR ROLE cardo_banking IN SCHEMA banking GRANT SELECT ON TABLES TO cardo_qa;
ALTER DEFAULT PRIVILEGES FOR ROLE cardo_engagement IN SCHEMA engagement GRANT SELECT ON TABLES TO cardo_qa;
SQL
