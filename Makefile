.PHONY: dev dev-container test typecheck build seed migrate check compose-check compose-check-prod

dev:
	npm run dev

dev-container:
	docker compose -p chore-dev -f ops/compose/compose.dev.yml up --build

test:
	npm test

typecheck:
	npm run typecheck

build:
	npm run build

seed:
	APP_ENV=development DATABASE_PATH=.local/dev/app.sqlite npm run db:seed

migrate:
	APP_ENV=development DATABASE_PATH=.local/dev/app.sqlite npm run db:migrate

check:
	APP_ENV=development DATABASE_PATH=.local/dev/app.sqlite npm run db:check

compose-check:
	docker compose -p chore-dev -f ops/compose/compose.dev.yml config --quiet

compose-check-prod:
	APP_IMAGE_TAG=smoke TIDY_DATA_DIR=/srv/tidy-week/data TIDY_ASSETS_DIR=/srv/tidy-week/assets docker compose -p tidy-week -f ops/compose/compose.prod.yml config --quiet
