import requests
from decouple import config

def envoyer_identifiants_email(destinataire_email, destinataire_nom, username, mot_de_passe, boutique_nom):
    api_key = config('BREVO_API_KEY', default=None)
    if not api_key:
        return False, "BREVO_API_KEY non configurée"

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": api_key,
        "content-type": "application/json",
    }
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #0891b2;">Bienvenue sur iwiShop !</h2>
        <p>Bonjour {destinataire_nom},</p>
        <p>Ta demande d'accès pour <strong>{boutique_nom}</strong> a été approuvée.</p>
        <p>Voici tes identifiants de connexion :</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>Nom d'utilisateur :</strong> {username}</p>
            <p><strong>Mot de passe temporaire :</strong> {mot_de_passe}</p>
        </div>
        <p style="color: #dc2626;">⚠️ Pour ta sécurité, change ce mot de passe dès ta première connexion, depuis Paramètres &gt; Mon Compte.</p>
        <p>À bientôt sur iwiShop !</p>
    </body>
    </html>
    """
    payload = {
        "sender": {"name": config('BREVO_SENDER_NAME', default='iwiShop'), "email": config('BREVO_SENDER_EMAIL')},
        "to": [{"email": destinataire_email, "name": destinataire_nom}],
        "subject": "Tes identifiants de connexion iwiShop",
        "htmlContent": html_content,
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code in (200, 201):
            return True, None
        return False, f"Brevo a répondu {response.status_code}: {response.text}"
    except requests.RequestException as e:
        return False, str(e)

def notifier_nouvelle_demande(nom_contact, email_contact, nom_boutique_souhaite, telephone):
    api_key = config('BREVO_API_KEY', default=None)
    owner_email = config('PLATFORM_OWNER_EMAIL', default=None)
    frontend_url = config('FRONTEND_URL', default='http://localhost:5174')

    if not api_key or not owner_email:
        return False, "BREVO_API_KEY ou PLATFORM_OWNER_EMAIL non configurée"

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": api_key,
        "content-type": "application/json",
    }
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #0891b2;">Nouvelle demande d'accès iwiShop</h2>
        <p>Une nouvelle demande vient d'être soumise :</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>Contact :</strong> {nom_contact}</p>
            <p><strong>Email :</strong> {email_contact}</p>
            <p><strong>Téléphone :</strong> {telephone or 'Non renseigné'}</p>
            <p><strong>Boutique souhaitée :</strong> {nom_boutique_souhaite}</p>
        </div>
        <p>
            <a href="{frontend_url}/admin-plateforme"
               style="display:inline-block; background:#0891b2; color:white; padding:10px 20px; border-radius:6px; text-decoration:none;">
               Voir la demande dans le panneau admin
            </a>
        </p>
        <p style="color:#666; font-size:13px;">Tu dois te connecter avec ton compte propriétaire pour approuver ou rejeter.</p>
    </body>
    </html>
    """
    payload = {
        "sender": {"name": config('BREVO_SENDER_NAME', default='iwiShop'), "email": config('BREVO_SENDER_EMAIL')},
        "to": [{"email": owner_email}],
        "subject": f"Nouvelle demande d'accès : {nom_boutique_souhaite}",
        "htmlContent": html_content,
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code in (200, 201):
            return True, None
        return False, f"Brevo a répondu {response.status_code}: {response.text}"
    except requests.RequestException as e:
        return False, str(e)
