"""Tests du hook de secrets (scripts/git-hooks/pre-commit).

Lancement, depuis la racine du dépôt :
    python -m unittest discover -s scripts/git-hooks -p "test_*.py" -v

Chaque test crée un dépôt git temporaire, y indexe des fichiers, puis
lance le hook comme git le fait (depuis la racine de ce dépôt). Le faux
secret est assemblé à l'exécution : ce fichier ne déclenche pas lui-même
le hook. L'emoji et le nom accentué sont écrits en échappement.
"""
import contextlib
import importlib.machinery
import importlib.util
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

CHEMIN_HOOK = Path(__file__).resolve().parent / "pre-commit"

# Reconnu par le motif « Token de service connu » du hook.
FAUX_SECRET = "ghp_" + "a1B2c3D4" * 3

# Forme d'une clé Anthropic (sk-ant-api03-...), valeur inventée.
FAUSSE_CLE_ANTHROPIC = "sk-" + "ant-api03-" + "Zx9_Yw8-Vu7" * 8 + "AA"

# U+26A0 U+FE0F : emoji « attention ». En UTF-8, U+FE0F donne l'octet
# 0x8F, inconnu de cp1252 (Windows).
EMOJI_ATTENTION = "⚠️"


def charger_hook():
    chargeur = importlib.machinery.SourceFileLoader("hook_pre_commit", str(CHEMIN_HOOK))
    spec = importlib.util.spec_from_loader(chargeur.name, chargeur)
    module = importlib.util.module_from_spec(spec)
    chargeur.exec_module(module)
    return module


class HookSecretsTests(unittest.TestCase):
    def setUp(self):
        dossier = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(dossier.cleanup)
        self.depot = Path(dossier.name)
        self.git("init", "-q")

    def git(self, *args):
        # Dossier de hooks inexistant : le commit de préparation (test du
        # renommage) ne lance aucun hook.
        return subprocess.run(
            [
                "git", "-c", "core.hooksPath=aucun-hook",
                "-c", "user.name=Test", "-c", "user.email=test@example.com",
                *args,
            ],
            cwd=self.depot, capture_output=True, check=True,
        )

    def indexer(self, chemin, contenu):
        (self.depot / chemin).write_bytes(contenu)
        self.git("add", "--", chemin)

    def lancer_hook(self):
        # PYTHONIOENCODING ne change que la sortie du hook (lue ici en
        # UTF-8), pas la façon dont il décode ce que git lui renvoie.
        resultat = subprocess.run(
            [sys.executable, str(CHEMIN_HOOK)],
            cwd=self.depot, capture_output=True,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        return resultat.returncode, resultat.stderr.decode("utf-8", errors="replace")

    def test_secret_ascii_bloque(self):
        self.indexer("config.py", f'token = "{FAUX_SECRET}"\n'.encode("utf-8"))
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 1, sortie)
        self.assertIn("config.py:1", sortie)

    def test_secret_dans_un_fichier_avec_emoji_bloque(self):
        contenu = f'TITRE = "{EMOJI_ATTENTION} Attention"\ntoken = "{FAUX_SECRET}"\n'
        self.indexer("alerte.py", contenu.encode("utf-8"))
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 1, sortie)
        self.assertIn("alerte.py:2", sortie)

    def test_secret_dans_un_fichier_avec_octet_hors_utf8_bloque(self):
        # 0x81 : ni UTF-8 valide, ni connu de cp1252.
        contenu = b"note \x81\n" + f"token = {FAUX_SECRET}\n".encode("utf-8")
        self.indexer("brut.txt", contenu)
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 1, sortie)
        self.assertIn("brut.txt:2", sortie)

    def test_secret_dans_un_fichier_au_nom_accentue_bloque(self):
        nom = "café.txt"
        self.indexer(nom, f"token = {FAUX_SECRET}\n".encode("utf-8"))
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 1, sortie)
        self.assertIn(f"{nom}:1", sortie)

    def test_secret_ajoute_dans_un_fichier_renomme_bloque(self):
        lignes = "".join(f"ligne {i}\n" for i in range(30)).encode("utf-8")
        self.indexer("ancien.txt", lignes)
        self.git("commit", "-q", "-m", "depart")
        self.git("mv", "ancien.txt", "nouveau.txt")
        self.indexer("nouveau.txt", lignes + f"token = {FAUX_SECRET}\n".encode("utf-8"))
        # Le test n'a de sens que si git voit bien un renommage.
        etat = self.git("diff", "--cached", "--name-status").stdout.decode("utf-8")
        self.assertTrue(etat.startswith("R"), etat)
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 1, sortie)
        self.assertIn("nouveau.txt:31", sortie)

    def test_fichier_illisible_bloque_le_commit(self):
        self.indexer("normal.txt", b"rien\n")
        hook = charger_hook()
        vrai_run = subprocess.run

        def run_simule(commande, *args, **kwargs):
            if commande[:2] == ["git", "show"]:
                return subprocess.CompletedProcess(
                    commande, 128, stdout=b"", stderr=b"fatal: lecture simulee impossible",
                )
            return vrai_run(commande, *args, **kwargs)

        dossier_initial = os.getcwd()
        os.chdir(self.depot)
        self.addCleanup(os.chdir, dossier_initial)
        erreurs = io.StringIO()
        with mock.patch.object(hook.subprocess, "run", run_simule), contextlib.redirect_stderr(erreurs):
            code = hook.main()
        self.assertEqual(code, 1, erreurs.getvalue())
        self.assertIn("Impossible de lire normal.txt", erreurs.getvalue())
        self.assertIn("lecture simulee impossible", erreurs.getvalue())

    def test_fichier_binaire_saute_et_cite(self):
        self.indexer("image.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 0, sortie)
        self.assertIn("Fichier binaire non analysé : image.png", sortie)

    def test_cle_anthropic_seule_bloquee(self):
        """Hors d'une affectation à un nom en ...API_KEY (que la règle
        « Clé/secret assigné en dur » voit déjà) : dans un texte, un
        journal, une variable nommée autrement."""
        contenu = f"Notes de prod\nclé collée ici : {FAUSSE_CLE_ANTHROPIC}\n"
        self.indexer("notes.md", contenu.encode("utf-8"))
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 1, sortie)
        self.assertIn("notes.md:2", sortie)
        self.assertIn("Clé Anthropic (sk-ant-...)", sortie)
        self.assertNotIn(FAUSSE_CLE_ANTHROPIC, sortie)

    def test_cle_anthropic_dans_une_variable_autrement_nommee_bloquee(self):
        self.indexer("iwi.py", f'cle = "{FAUSSE_CLE_ANTHROPIC}"\n'.encode("utf-8"))
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 1, sortie)
        self.assertIn("iwi.py:1", sortie)

    def test_simple_mention_du_prefixe_sk_ant_passe(self):
        """Faux positif à éviter : la documentation qui cite le préfixe."""
        self.indexer("doc.md", "Le hook bloque les clés Anthropic (préfixe sk-ant-).\n".encode("utf-8"))
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 0, sortie)
        self.assertEqual(sortie, "")

    def test_fichier_avec_emoji_sans_secret_passe(self):
        self.indexer("alerte.py", f'TITRE = "{EMOJI_ATTENTION} Attention"\n'.encode("utf-8"))
        code, sortie = self.lancer_hook()
        self.assertEqual(code, 0, sortie)
        self.assertEqual(sortie, "")


if __name__ == "__main__":
    unittest.main()
