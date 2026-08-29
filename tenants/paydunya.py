import hashlib
import logging

import requests
from decouple import config

logger = logging.getLogger(__name__)

BASE_URL = (
    'https://app.paydunya.com/api/v1'
    if config('PAYDUNYA_MODE', default='test') == 'live'
    else 'https://app.paydunya.com/sandbox-api/v1'
)


def _headers():
    return {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': config('PAYDUNYA_MASTER_KEY'),
        'PAYDUNYA-PRIVATE-KEY': config('PAYDUNYA_PRIVATE_KEY'),
        'PAYDUNYA-PUBLIC-KEY': config('PAYDUNYA_PUBLIC_KEY'),
        'PAYDUNYA-TOKEN': config('PAYDUNYA_TOKEN'),
    }


def creer_facture(paiement):
    """Crée une facture PayDunya pour ce PaiementAbonnement.

    Retourne (True, {"token": ..., "url": ...}) ou (False, message_erreur).
    """
    frontend_url = config('FRONTEND_URL', default='http://localhost:5174')
    backend_url = config('BACKEND_URL', default='http://127.0.0.1:8001')

    payload = {
        "invoice": {
            "total_amount": int(paiement.formule.prix),
            "description": f"Abonnement iwiShop - {paiement.formule.nom}",
        },
        "store": {
            "name": "iwiShop",
        },
        "custom_data": {
            "paiement_id": paiement.id,
            "boutique_id": paiement.boutique_id,
            "formule_id": paiement.formule_id,
        },
        "actions": {
            "cancel_url": f"{frontend_url}/abonnement/retour",
            "return_url": f"{frontend_url}/abonnement/retour",
            "callback_url": f"{backend_url}/api/tenants/paydunya-webhook/",
        },
    }

    try:
        response = requests.post(
            f"{BASE_URL}/checkout-invoice/create",
            json=payload,
            headers=_headers(),
            timeout=15,
        )
    except requests.RequestException as e:
        logger.error("PayDunya create-invoice a échoué (réseau) : %s", e)
        return False, str(e)

    data = response.json()
    if data.get('response_code') != '00':
        logger.error("PayDunya create-invoice a refusé : %s", data)
        return False, data.get('response_text', 'Erreur PayDunya inconnue')

    return True, {"token": data['token'], "url": data['response_text']}


def confirmer_facture(token):
    """Rappelle PayDunya en serveur-à-serveur pour connaître le statut RÉEL
    d'une facture. C'est ce résultat, jamais le contenu du webhook POST, qui
    fait foi pour créditer un abonnement.

    Retourne le statut ('completed', 'pending', 'cancelled', ...) ou None en
    cas d'échec de la vérification.
    """
    try:
        response = requests.get(
            f"{BASE_URL}/checkout-invoice/confirm/{token}",
            headers=_headers(),
            timeout=15,
        )
    except requests.RequestException as e:
        logger.error("PayDunya confirm a échoué (réseau) : %s", e)
        return None

    data = response.json()
    if data.get('response_code') != '00':
        logger.warning("PayDunya confirm : réponse non-00 pour le token %s : %s", token, data)
        return None

    return data.get('status')


def hash_valide(hash_recu):
    """Le hash envoyé par PayDunya dans l'IPN est sha512(MasterKey). Ça ne
    prouve que l'origine (pas le contenu du payload) - c'est un premier
    filtre rapide, pas la vérification définitive (voir confirmer_facture)."""
    if not hash_recu:
        return False
    master_key = config('PAYDUNYA_MASTER_KEY')
    attendu = hashlib.sha512(master_key.encode('utf-8')).hexdigest()
    return hash_recu == attendu
