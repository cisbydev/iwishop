from pathlib import Path
from decouple import config  # <-- nouvelle ligne
import dj_database_url
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY')                          # <-- remplace l'ancienne ligne
DEBUG = config('DEBUG', default=False, cast=bool)           # <-- remplace l'ancienne ligne DEBUG = True

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='127.0.0.1,localhost', cast=lambda v: [s.strip() for s in v.split(',')])

# Stockage des médias (Produit.photo, ParametresBoutique.logo) : bascule sur
# Cloudflare R2 (compatible S3) uniquement si configuré
# (CLOUDFLARE_R2_BUCKET_NAME renseigné), sinon FileSystemStorage local par
# défaut - un dev n'a pas besoin d'un compte R2 pour lancer le projet. Le
# disque local d'un service web Render est éphémère (pas de disque
# persistant attaché) : les fichiers uploadés en production n'y survivent
# pas à un redémarrage du conteneur (bug constaté - logo qui redevient
# l'ancien après un redéploiement/une remise en veille). Cloudinary a été
# écarté : service bloqué depuis le Mali ("not available in your country").
CLOUDFLARE_R2_BUCKET_NAME = config('CLOUDFLARE_R2_BUCKET_NAME', default='')

# Render termine le HTTPS à son edge et transmet en HTTP interne à l'app -
# sans ça, request.is_secure() renverrait toujours False. Sûr uniquement
# parce que l'app n'est jamais exposée directement, seulement via ce proxy.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')




# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',


    # Packages tiers
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',

    # Modules SoraShop (à créer au fil des phases)
    'tenants',
    'accounts',
    'parametres', # (pour settings de la boutique, renommé pour éviter la collision avec settings.py de Django)
    'categories',
    'suppliers',
    'products',
    'inventory',
    'purchases',
    'sales',
    'expenses',
    'reports',
    'dashboard',
]

INSTALLED_APPS += [
    # Placé après nos apps : accounts définit une commande `runserver` personnalisée
    # (port par défaut fixé à 8001) qui doit avoir priorité sur celle de staticfiles.
    'django.contrib.staticfiles',
]

if CLOUDFLARE_R2_BUCKET_NAME:
    INSTALLED_APPS += ['storages']

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Autoriser les requêtes du frontend (liste définie via la variable d'environnement
# CORS_ALLOWED_ORIGINS, ex: "http://localhost:5174,https://mon-app.vercel.app")
CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='', cast=lambda v: [s.strip() for s in v.split(',') if s.strip()])

# La Vue Support ajoute un header custom (X-Support-Boutique) sur les requêtes
# sortantes du frontend - sans ça, le navigateur bloque la requête au niveau du
# preflight CORS car ce header n'est pas dans la liste par défaut de corsheaders.
CORS_ALLOW_HEADERS = list(default_headers) + ['x-support-boutique']

ROOT_URLCONF = 'sorashop_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'sorashop_backend.wsgi.application'




REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Sans ça, chaque liste (produits, ventes, achats...) renvoyait TOUTES
    # les lignes en une fois - l'historique d'une vraie boutique finirait
    # par produire des réponses énormes (audit point 13).
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    # Pas de DEFAULT_THROTTLE_CLASSES ici volontairement : ces taux ne
    # s'appliquent qu'aux vues qui déclarent explicitement throttle_classes
    # (CustomTokenObtainPairView, cf. accounts.throttling) - aucune autre
    # route n'est limitée par ce biais.
    #
    # Aucun CACHES n'est défini dans ce fichier -> Django retombe sur son
    # défaut implicite, LocMemCache, propre à CHAQUE PROCESSUS. Avec
    # plusieurs workers Gunicorn, le seuil ci-dessous est donc appliqué
    # par worker, pas globalement (N workers ~= seuil réel multiplié par
    # N) - ça réduit très largement le volume de brute-force possible par
    # rapport à l'absence totale actuelle de throttling, mais ce n'est
    # pas une garantie stricte tant qu'un cache partagé (Redis) n'est pas
    # configuré. Non traité ici (hors périmètre de ce correctif).
    'DEFAULT_THROTTLE_RATES': {
        'login_ip': '10/min',
        'login_username': '5/min',
    },
}

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES': ('Bearer',),
}


   
# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    'default': dj_database_url.parse(
        config('DATABASE_URL', default=f'sqlite:///{BASE_DIR / "db.sqlite3"}'),
        ssl_require=config('DATABASE_SSL_REQUIRE', default=False, cast=bool),
    )
}
# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/


LANGUAGE_CODE = 'fr-fr'

TIME_ZONE = 'Africa/Bamako' # Ou votre fuseau horaire actuel

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'


STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

if CLOUDFLARE_R2_BUCKET_NAME:
    AWS_ACCESS_KEY_ID = config('CLOUDFLARE_R2_ACCESS_KEY', default='')
    AWS_SECRET_ACCESS_KEY = config('CLOUDFLARE_R2_SECRET_KEY', default='')
    AWS_STORAGE_BUCKET_NAME = CLOUDFLARE_R2_BUCKET_NAME
    AWS_S3_ENDPOINT_URL = config('CLOUDFLARE_R2_ENDPOINT_URL', default='')
    AWS_S3_REGION_NAME = 'auto'
    # R2 exige la signature s3v4 (pas la valeur par défaut de boto3 pour un
    # endpoint non-AWS) - sans ça, erreurs "SignatureDoesNotMatch".
    AWS_S3_SIGNATURE_VERSION = 's3v4'
    # R2 rejette les ACL façon S3 ("AccessControlListNotSupported") - ne
    # jamais envoyer d'en-tête ACL sur les objets.
    AWS_DEFAULT_ACL = None
    # Parité avec FileSystemStorage (qui ne remplace jamais un fichier
    # existant silencieusement, cf. get_available_name) : sans ça,
    # django-storages écraserait un objet existant du même nom.
    AWS_S3_FILE_OVERWRITE = False

STORAGES = {
    "default": {
        "BACKEND": (
            "storages.backends.s3boto3.S3Boto3Storage"
            if CLOUDFLARE_R2_BUCKET_NAME else
            "django.core.files.storage.FileSystemStorage"
        ),
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
