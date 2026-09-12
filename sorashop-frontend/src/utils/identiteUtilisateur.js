export function deriverIdentiteUtilisateur(utilisateur) {
  const nomUtilisateur = utilisateur?.username || 'Utilisateur';
  const initialeUtilisateur = nomUtilisateur.trim().charAt(0).toUpperCase() || 'U';
  return { nomUtilisateur, initialeUtilisateur };
}
