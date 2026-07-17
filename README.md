# EventRent CI

Application de gestion de location de matériel événementiel (Côte d'Ivoire), connectée à Supabase.

## Déploiement rapide (GitHub + Vercel)

1. Crée un nouveau repo GitHub, ex : `Stick78/eventrent-ci`
2. Mets tous ces fichiers dedans (via l'interface web GitHub, comme pour tes autres projets)
3. Va sur vercel.com → **Add New Project** → importe ce repo
4. Dans les **Environment Variables** de Vercel, ajoute :
   - `VITE_SUPABASE_URL` = `https://olgihnpsejxehyoowyei.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (la clé anon fournie dans le fichier .env)
5. Clique **Deploy**

Le fichier `.env` déjà présent dans le projet permet aussi de tester en local avec `npm install` puis `npm run dev`.

## Ce qui est déjà connecté à ta vraie base Supabase

- Inventaire (ajout, modification, suppression, disponibilité par date)
- Réservations (saisie manuelle, packs, zones, saisonnalité)
- Paiements multi-modes (Mobile Money, Espèces, Virement, Chèque), plusieurs paiements par commande
- Caution et calcul de retenue après état des lieux de retour
- Logistique (livreurs internes/freelances)
- Planning visuel par semaine
- Clients avec historique et mise en vigilance

## Ce qui reste à brancher ensuite

- Vrai lien de paiement Mobile Money (nécessite un compte CinetPay ou PayDunya)
- Vrai envoi de code OTP par SMS
- Stockage des photos sur Supabase Storage plutôt qu'en base64 (utile quand le volume de photos augmentera)
