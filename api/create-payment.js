// /api/create-payment.js
//
// Fonction serveur (Vercel Serverless Function). Ne tourne JAMAIS dans le
// navigateur — c'est justement pour ça qu'elle existe : elle seule connaît
// les clés secrètes PayDunya et Supabase, qui ne doivent jamais apparaître
// dans le code envoyé au client.
//
// Variables d'environnement nécessaires (à définir dans Vercel → Settings →
// Environment Variables, PAS dans le code) :
//   PAYDUNYA_MASTER_KEY
//   PAYDUNYA_PRIVATE_KEY
//   PAYDUNYA_PUBLIC_KEY
//   PAYDUNYA_TOKEN
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (la clé "service_role", PAS la clé "anon")
//   PUBLIC_SITE_URL             (ex: https://eventrent-ci.vercel.app)

import { createClient } from "@supabase/supabase-js";

const PLAN_PRICING = {
  standard: { label: "Standard", price: 10000 },
  multi_magasin: { label: "Multi-magasins", price: 20000 },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  // Vérification explicite des variables d'environnement : plutôt que de
  // laisser planter la connexion à Supabase ou l'appel PayDunya sans
  // explication, on dit précisément ce qui manque.
  const requiredEnv = [
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    "PAYDUNYA_MASTER_KEY", "PAYDUNYA_PRIVATE_KEY", "PAYDUNYA_PUBLIC_KEY", "PAYDUNYA_TOKEN",
    "PUBLIC_SITE_URL",
  ];
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("create-payment: variables manquantes :", missing);
    return res.status(500).json({ error: `Configuration incomplète côté serveur. Variable(s) manquante(s) : ${missing.join(", ")}` });
  }

  try {
    const { accountId, plan } = req.body || {};
    if (!accountId || !PLAN_PRICING[plan]) {
      return res.status(400).json({ error: "Paramètres invalides (accountId ou plan manquant/incorrect)" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Vérifie que le compte existe réellement avant de créer une facture
    const { data: account, error: accErr } = await supabase
      .from("accounts")
      .select("id, company_name")
      .eq("id", accountId)
      .single();
    if (accErr || !account) {
      return res.status(404).json({ error: "Compte introuvable" });
    }

    const { label, price } = PLAN_PRICING[plan];
    const siteUrl = process.env.PUBLIC_SITE_URL;

    // Enregistre une transaction "pending" avant même de contacter PayDunya,
    // pour garder une trace même si l'appel échoue ensuite.
    const { data: tx, error: txErr } = await supabase
      .from("payment_transactions")
      .insert({ account_id: accountId, plan, amount: price, provider: "paydunya", status: "pending" })
      .select()
      .single();
    if (txErr) throw txErr;

    const payload = {
      invoice: {
        total_amount: price,
        description: `Abonnement EventRent CI — Formule ${label} (${account.company_name})`,
      },
      store: {
        name: "EventRent CI",
      },
      actions: {
        cancel_url: `${siteUrl}/?payment=cancelled`,
        return_url: `${siteUrl}/?payment=return&tx=${tx.id}`,
        callback_url: `${siteUrl}/api/paydunya-webhook`,
      },
      custom_data: {
        account_id: accountId,
        transaction_id: tx.id,
        plan,
      },
    };

    const pdResponse = await fetch("https://app.paydunya.com/api/v1/checkout-invoice/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": process.env.PAYDUNYA_MASTER_KEY,
        "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY,
        "PAYDUNYA-PUBLIC-KEY": process.env.PAYDUNYA_PUBLIC_KEY,
        "PAYDUNYA-TOKEN": process.env.PAYDUNYA_TOKEN,
      },
      body: JSON.stringify(payload),
    });
    const pdData = await pdResponse.json();

    if (pdData.response_code !== "00" || !pdData.response_text) {
      await supabase.from("payment_transactions").update({ status: "failed" }).eq("id", tx.id);
      console.error("PayDunya a refusé la création du paiement :", JSON.stringify(pdData));
      const pdMessage = pdData.response_text || pdData.message || (pdData.errors ? JSON.stringify(pdData.errors) : null) || JSON.stringify(pdData);
      return res.status(502).json({ error: `PayDunya : ${pdMessage}` });
    }

    // Mémorise le token PayDunya pour pouvoir vérifier le paiement plus tard
    await supabase.from("payment_transactions").update({ provider_token: pdData.token }).eq("id", tx.id);

    return res.status(200).json({ paymentUrl: pdData.response_text, transactionId: tx.id });
  } catch (e) {
    console.error("create-payment error:", e);
    return res.status(500).json({ error: "Erreur interne", details: e.message });
  }
}
