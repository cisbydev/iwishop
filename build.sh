#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
python manage.py create_superuser_auto
python manage.py reset_mdp_dernier_compte_test  # TEMPORAIRE - diagnostic bug login, à retirer après usage
