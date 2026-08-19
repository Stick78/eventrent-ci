// /api/paydunya-webhook.js
//
// PayDunya appelle CETTE adresse directement depuis leurs serveurs (pas
// depuis le navigateur du client) une fois le paiement effectué. C'est la
// SEULE source vraiment fiable pour activer un compte : contrairement à une
// simple redirection du navigateur, un appel serveur-à-serveur ne peut pas
// être falsifié par quelqu'un qui bidouillerait l'URL de retour.
//
// Sécurité : avant de croire quoi que ce soit reçu ici, on revérifie le
// statut du paiement directement auprès de PayDunya (confirm-invoice) avec
// nos propres clés secrètes — on ne fait jamais confiance aveuglément au
// contenu brut du webhook.

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Méthode non autorisée");
  }

  try {
    const token = req.body?.data?.token || req.body?.token;
    if (!token) {
      return res.status(400).send("Token manquant");
    }

    // Revérifie le paiement directement auprès de PayDunya (ne jamais faire
    // confiance au seul contenu du webhook, qui pourrait être rejoué/falsifié)
    const confirmResp = await fetch(`https://app.paydunya.com/api/v1/checkout-invoice/confirm/${token}`, {
      headers: {
        "PAYDUNYA-MASTER-KEY": process.env.PAYDUNYA_MASTER_KEY,
        "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY,
        "PAYDUNYA-PUBLIC-KEY": process.env.PAYDUNYA_PUBLIC_KEY,
        "PAYDUNYA-TOKEN": process.env.PAYDUNYA_TOKEN,
      },
    });
    const confirmData = await confirmResp.json();

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: tx } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("provider_token", token)
      .single();

    if (!tx) {
      console.error("Webhook PayDunya : transaction introuvable pour le token", token);
      return res.status(404).send("Transaction introuvable");
    }

    if (confirmData.status !== "completed") {
      await supabase.from("payment_transactions").update({ status: "failed" }).eq("id", tx.id);
      return res.status(200).send("Paiement non confirmé, transaction marquée échouée");
    }

    // Paiement confirmé : on active le compte pour 30 jours et on applique la formule payée
    const paidUntil = new Date();
    paidUntil.setDate(paidUntil.getDate() + 30);

    await supabase.from("accounts").update({
      subscription_status: "active",
      plan: tx.plan,
      paid_until: paidUntil.toISOString().slice(0, 10),
    }).eq("id", tx.account_id);

    await supabase.from("payment_transactions").update({
      status: "completed",
      confirmed_at: new Date().toISOString(),
    }).eq("id", tx.id);

    return res.status(200).send("OK");
  } catch (e) {
    console.error("paydunya-webhook error:", e);
    return res.status(500).send("Erreur interne");
  }
}
