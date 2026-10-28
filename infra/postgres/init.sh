#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cardo_customer') THEN CREATE ROLE cardo_customer LOGIN PASSWORD 'cardo_customer_dev'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cardo_banking') THEN CREATE ROLE cardo_banking LOGIN PASSWORD 'cardo_banking_dev'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cardo_engagement') THEN CREATE ROLE cardo_engagement LOGIN PASSWORD 'cardo_engagement_dev'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cardo_rates') THEN CREATE ROLE cardo_rates LOGIN PASSWORD 'cardo_rates_dev'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cardo_qa') THEN CREATE ROLE cardo_qa LOGIN PASSWORD 'cardo_qa_dev'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cardo_telemetry') THEN CREATE ROLE cardo_telemetry LOGIN PASSWORD 'cardo_telemetry_dev'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cardo_grafana') THEN CREATE ROLE cardo_grafana LOGIN PASSWORD 'cardo_grafana_dev'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS customer AUTHORIZATION cardo_customer;
CREATE SCHEMA IF NOT EXISTS banking AUTHORIZATION cardo_banking;
CREATE SCHEMA IF NOT EXISTS engagement AUTHORIZATION cardo_engagement;
CREATE SCHEMA IF NOT EXISTS rates AUTHORIZATION cardo_rates;
CREATE SCHEMA IF NOT EXISTS telemetry AUTHORIZATION cardo_telemetry;
ALTER ROLE cardo_grafana SET default_transaction_read_only=on;
ALTER ROLE cardo_grafana SET statement_timeout='5s';
ALTER ROLE cardo_grafana SET search_path='telemetry,banking';
GRANT USAGE ON SCHEMA banking,telemetry TO cardo_grafana;
GRANT USAGE ON SCHEMA customer,banking,engagement,rates TO cardo_qa;
GRANT SELECT ON ALL TABLES IN SCHEMA customer,banking,engagement,rates TO cardo_qa;
ALTER DEFAULT PRIVILEGES FOR ROLE cardo_customer IN SCHEMA customer GRANT SELECT ON TABLES TO cardo_qa;
ALTER DEFAULT PRIVILEGES FOR ROLE cardo_banking IN SCHEMA banking GRANT SELECT ON TABLES TO cardo_qa;
ALTER DEFAULT PRIVILEGES FOR ROLE cardo_engagement IN SCHEMA engagement GRANT SELECT ON TABLES TO cardo_qa;
ALTER DEFAULT PRIVILEGES FOR ROLE cardo_rates IN SCHEMA rates GRANT SELECT ON TABLES TO cardo_qa;
SQL
