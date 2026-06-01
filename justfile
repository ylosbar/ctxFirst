set shell := ["bash", "-cu"]

default:
    @just --list

# --- desktop ---

desktop-dev:
    yarn workspace @ctxfirst/desktop dev

desktop-start:
    yarn workspace @ctxfirst/desktop start

desktop-build:
    yarn workspace @ctxfirst/desktop build

desktop-package:
    yarn workspace @ctxfirst/desktop package

# Vide la base SQLite et le dossier artifacts (dev + packagé). Demande confirmation.
desktop-wipe-db *ARGS:
    yarn workspace @ctxfirst/desktop wipe-db {{ARGS}}

install:
    yarn install

# --- api ---

api-dev:
    yarn workspace @ctxfirst/api dev

api-build:
    yarn workspace @ctxfirst/api build

api-start:
    yarn workspace @ctxfirst/api start

# --- lint ---

lint:
    yarn lint

lint-fix:
    yarn lint:fix

# --- audit ---

# Détecte les éléments HTML bruts (<button>/<input>/<select>/<textarea>) à migrer vers le DS.
audit-raw-jsx *ARGS:
    yarn audit-raw-jsx {{ARGS}}

# Vérifie les liens de fichiers cassés dans les .md du repo.
audit-markdown-links:
    yarn audit-markdown-links
