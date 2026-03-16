# infra/persona1

This directory is reserved for deployment and infrastructure config for:

- Cloud Run
- Cloud SQL
- Secret Manager refs
- service-level environment configuration

Current runtime assumptions:

- local development defaults to filesystem persistence
- production should supply `AI_OS_DATABASE_URL` or `PERSONA1_DATABASE_URL` for Postgres
- production should supply `OPENROUTER_API_KEY` for live inference
- production billing should supply `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID`
- current auth mode is `local_hmac`
- `FIREBASE_PROJECT_ID` plus `PERSONA1_AUTH_MODE=firebase_jwt` enables the Firebase-compatible verifier already shipped in the API

The repo already contains the Postgres migration file at:

- [001_initial.sql](/C:/Users/moham/persona1/packages/db/migrations/001_initial.sql)
