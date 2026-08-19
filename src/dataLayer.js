import { supabase, supabaseSignup, createAuthedClient } from "./supabaseClient";

// ---------- mapping helpers (snake_case DB -> camelCase UI) ----------
const mapInventory = (r) => ({
  id: r.id, name: r.name, category: r.category, total: r.total_qty,
  unit: Number(r.unit_price), low: r.low_stock_threshold, photo: r.photo_url,
});
const mapClient = (r) => ({ id: r.id, name: r.name, phone: r.phone, flagged: r.flagged, notes: r.notes || "", createdAt: r.created_at ? r.created_at.slice(0, 10) : null });
const mapDriver = (r) => ({ id: r.id, name: r.name, phone: r.phone, type: r.type, fee: Number(r.fee_per_delivery) });
const mapPack = (r) => ({ id: r.id, name: r.name, items: (r.pack_items || []).map((pi) => ({ itemId: pi.item_id, qty: pi.qty })) });
const mapReservation = (r) => ({
  id: r.id,
  clientId: r.client_id,
  clientName: r.clients?.name || "Client",
  driverId: r.driver_id,
  startDate: r.start_date,
  endDate: r.end_date,
  address: r.address,
  zone: r.zone,
  seasonal: r.seasonal,
  status: r.status,
  caution: Number(r.caution || 0),
  cautionReturned: r.caution_returned != null ? Number(r.caution_returned) : null,
  checkOut: r.checkout_photo_url,
  checkIn: r.checkin_photo_url,
  discountType: r.discount_type || null,
  discountValue: Number(r.discount_value || 0),
  deliveryFeeOverride: r.delivery_fee_override != null ? Number(r.delivery_fee_override) : null,
  items: (r.reservation_items || []).map((ri) => ({
    riId: ri.id, itemId: ri.item_id, name: ri.inventory?.name || "Article",
    qty: ri.qty, unit: Number(ri.unit_price), damagedQty: ri.damaged_qty || 0,
    discountType: ri.discount_type || null, discountValue: Number(ri.discount_value || 0),
  })),
  payments: (r.payments || []).map((p) => ({ id: p.id, amount: Number(p.amount), mode: p.mode, date: (p.paid_at || "").slice(0, 10) })),
  damaged: (r.reservation_items || []).filter((ri) => ri.damaged_qty > 0).map((ri) => ({ itemId: ri.item_id, qty: ri.damaged_qty })),
});
const mapSettings = (r) => ({
  id: r.id,
  companyName: r.company_name || "Mon entreprise",
  phone: r.phone || "",
  footerText: r.footer_text || "",
  logo: r.logo_base64 || null,
});
const mapProfile = (r) => ({ id: r.id, name: r.name, permissions: r.permissions || {}, storeId: r.store_id || null });
const mapAccount = (r) => ({
  id: r.id,
  companyName: r.company_name,
  trialStart: r.trial_start,
  trialEnd: r.trial_end,
  status: r.subscription_status,
  plan: r.plan,
  createdAt: r.created_at ? r.created_at.slice(0, 10) : null,
});

const RESERVATION_SELECT = `
  id, client_id, driver_id, start_date, end_date, address, zone, seasonal, status,
  caution, caution_returned, checkout_photo_url, checkin_photo_url, discount_type, discount_value,
  delivery_fee_override,
  clients ( name ),
  reservation_items ( id, item_id, qty, unit_price, damaged_qty, discount_type, discount_value, inventory ( name ) ),
  payments ( id, amount, mode, paid_at )
`;

// ============================================================
// AUTHENTIFICATION (Supabase Auth)
// ============================================================
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return data.subscription;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return {
    id: data.id,
    accountId: data.account_id,
    name: data.name,
    permissions: data.permissions || {},
    isPlatformAdmin: !!data.is_platform_admin,
    storeId: data.store_id || null,
  };
}

export async function fetchAccount(accountId) {
  const { data, error } = await supabase.from("accounts").select("*").eq("id", accountId).single();
  if (error) throw error;
  return mapAccount(data);
}

export async function signUpCompany({ companyName, adminName, email, password }) {
  const { data: authData, error: e1 } = await supabaseSignup.auth.signUp({ email, password });
  if (e1) throw e1;
  const userId = authData.user?.id;
  if (!userId) throw new Error("Inscription incomplète, réessaie.");
  if (!authData.session) throw new Error("Inscription incomplète (session manquante), réessaie.");

  // On délègue la création de l'entreprise + du profil à une fonction
  // sécurisée côté base de données : plus fiable qu'une écriture directe
  // depuis le navigateur juste après l'inscription.
  const { error: e2 } = await supabaseSignup.rpc("create_company_account", {
    p_company_name: companyName,
    p_admin_name: adminName,
  });
  if (e2) throw e2;

  return { needsEmailConfirmation: false };
}

// ============================================================
// DONNÉES MÉTIER (toutes filtrées par account_id)
// ============================================================
export async function fetchAll(accountId, storeId) {
  const [inv, cli, drv, pks, res] = await Promise.all([
    supabase.from("inventory").select("*").eq("account_id", accountId).eq("store_id", storeId).order("name"),
    supabase.from("clients").select("*").eq("account_id", accountId).order("name"),
    supabase.from("drivers").select("*").eq("account_id", accountId).order("name"),
    supabase.from("packs").select("*, pack_items(item_id, qty)").eq("account_id", accountId).eq("store_id", storeId),
    supabase.from("reservations").select(RESERVATION_SELECT).eq("account_id", accountId).eq("store_id", storeId).order("created_at", { ascending: true }),
  ]);
  const errs = [inv, cli, drv, pks, res].filter((x) => x.error);
  if (errs.length) throw errs[0].error;
  const settings = await fetchSettings(accountId);
  const teamMembers = await fetchTeamMembers(accountId);
  const additionalRevenues = await fetchAdditionalRevenues(accountId, storeId);
  const expenses = await fetchExpenses(accountId, storeId);
  return {
    inventory: inv.data.map(mapInventory),
    clients: cli.data.map(mapClient),
    drivers: drv.data.map(mapDriver),
    packs: pks.data.map(mapPack),
    reservations: res.data.map(mapReservation),
    settings,
    users: teamMembers,
    additionalRevenues,
    expenses,
  };
}

// ---------- magasins ----------
export async function fetchStores(accountId) {
  try {
    const { data, error } = await supabase.from("stores").select("*").eq("account_id", accountId).order("created_at");
    if (error) throw error;
    return data.map((s) => ({ id: s.id, name: s.name, address: s.address || "" }));
  } catch (e) {
    console.error("Impossible de charger les magasins :", e);
    return [];
  }
}
export async function createStore(accountId, name, address) {
  const { data, error } = await supabase.from("stores").insert({ account_id: accountId, name, address: address || "" }).select().single();
  if (error) throw error;
  return { id: data.id, name: data.name, address: data.address || "" };
}
export async function updateStore(id, name, address, accountId) {
  const { error } = await supabase.from("stores").update({ name, address: address || "" }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function deleteStore(id, accountId) {
  const { error } = await supabase.from("stores").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- inventory ----------
export async function saveInventoryItem(item, accountId, storeId) {
  const row = {
    name: item.name, category: item.category, total_qty: item.total,
    unit_price: item.unit, low_stock_threshold: item.low, photo_url: item.photo,
  };
  if (item.id) {
    const { error } = await supabase.from("inventory").update(row).eq("id", item.id).eq("account_id", accountId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("inventory").insert({ ...row, account_id: accountId, store_id: storeId });
    if (error) throw error;
  }
}
export async function deleteInventoryItem(id, accountId) {
  const { error } = await supabase.from("inventory").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- clients ----------
export async function createClient(name, phone, accountId) {
  const { data, error } = await supabase.from("clients").insert({ name, phone, account_id: accountId }).select().single();
  if (error) throw error;
  return data.id;
}
export async function setClientFlag(id, flagged, accountId) {
  const { error } = await supabase.from("clients").update({ flagged }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function updateClient(id, name, phone, accountId) {
  const { error } = await supabase.from("clients").update({ name, phone }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function deleteClient(id, accountId) {
  const { error } = await supabase.from("clients").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- drivers ----------
export async function createDriver(name, phone, type, fee, accountId) {
  const { data, error } = await supabase.from("drivers").insert({ name, phone, type, fee_per_delivery: fee || 0, account_id: accountId }).select().single();
  if (error) throw error;
  return data.id;
}
export async function updateDriver(id, name, phone, type, fee, accountId) {
  const { error } = await supabase.from("drivers").update({ name, phone, type, fee_per_delivery: fee || 0 }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function deleteDriver(id, accountId) {
  await supabase.from("reservations").update({ driver_id: null }).eq("driver_id", id).eq("account_id", accountId);
  const { error } = await supabase.from("drivers").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- reservations ----------
export async function createReservation({ clientId, items, startDate, endDate, address, zone, seasonal, caution, driverId, deposit, depositMode, discountType, discountValue, deliveryFeeOverride }, accountId, storeId) {
  const { data: resv, error: e1 } = await supabase.from("reservations").insert({
    client_id: clientId, driver_id: driverId || null, start_date: startDate, end_date: endDate,
    address, zone, seasonal, status: "En attente", caution: caution || 0, account_id: accountId, store_id: storeId,
    discount_type: discountType || null, discount_value: discountType ? (discountValue || 0) : 0,
    delivery_fee_override: deliveryFeeOverride != null ? deliveryFeeOverride : null,
  }).select().single();
  if (e1) throw e1;

  const itemRows = items.map((it) => ({
    reservation_id: resv.id, item_id: it.itemId, qty: it.qty, unit_price: it.unit, account_id: accountId,
    discount_type: it.discountType || null, discount_value: it.discountType ? (it.discountValue || 0) : 0,
  }));
  const { error: e2 } = await supabase.from("reservation_items").insert(itemRows);
  if (e2) throw e2;

  if (deposit && Number(deposit) > 0) {
    const { error: e3 } = await supabase.from("payments").insert({ reservation_id: resv.id, amount: Number(deposit), mode: depositMode, account_id: accountId });
    if (e3) throw e3;
  }
  return resv.id;
}

export async function updateReservationInfo(reservationId, { startDate, endDate, address, zone, seasonal, driverId, caution, discountType, discountValue, deliveryFeeOverride }, accountId) {
  const { error } = await supabase.from("reservations").update({
    start_date: startDate, end_date: endDate, address, zone, seasonal, driver_id: driverId || null, caution: caution || 0,
    discount_type: discountType || null, discount_value: discountType ? (discountValue || 0) : 0,
    delivery_fee_override: deliveryFeeOverride != null ? deliveryFeeOverride : null,
  }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function updateReservationItems(reservationId, items, accountId) {
  const { error: eDel } = await supabase.from("reservation_items").delete().eq("reservation_id", reservationId);
  if (eDel) throw eDel;
  if (items.length > 0) {
    const itemRows = items.map((it) => ({
      reservation_id: reservationId, item_id: it.itemId, qty: it.qty, unit_price: it.unit, account_id: accountId,
      discount_type: it.discountType || null, discount_value: it.discountType ? (it.discountValue || 0) : 0,
    }));
    const { error: eIns } = await supabase.from("reservation_items").insert(itemRows);
    if (eIns) throw eIns;
  }
}

export async function deleteReservation(reservationId, accountId) {
  await supabase.from("payments").delete().eq("reservation_id", reservationId);
  await supabase.from("reservation_items").delete().eq("reservation_id", reservationId);
  const { error } = await supabase.from("reservations").delete().eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function addPayment(reservationId, amount, mode, accountId) {
  const { error } = await supabase.from("payments").insert({ reservation_id: reservationId, amount, mode, account_id: accountId });
  if (error) throw error;
}

export async function setStatus(reservationId, status, accountId) {
  const { error } = await supabase.from("reservations").update({ status }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function saveCheckoutPhoto(reservationId, dataUrl, accountId) {
  const { error } = await supabase.from("reservations").update({ checkout_photo_url: dataUrl }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function saveCheckinPhoto(reservationId, dataUrl, accountId) {
  const { error } = await supabase.from("reservations").update({ checkin_photo_url: dataUrl }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function closeCheckIn(reservationId, damagedByRiId, cautionReturned, accountId) {
  await Promise.all(
    Object.entries(damagedByRiId).map(([riId, qty]) =>
      supabase.from("reservation_items").update({ damaged_qty: Number(qty) || 0 }).eq("id", riId)
    )
  );
  const { error } = await supabase.from("reservations").update({
    status: "Retourné", caution_returned: cautionReturned,
  }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- settings (personnalisation devis) ----------
export async function fetchSettings(accountId) {
  try {
    const { data, error } = await supabase.from("settings").select("*").eq("account_id", accountId).limit(1).maybeSingle();
    if (error || !data) {
      return { id: null, companyName: "Mon entreprise", phone: "", footerText: "Devis valable 15 jours à compter de la date d'émission.", logo: null };
    }
    return mapSettings(data);
  } catch (e) {
    console.error("Impossible de charger les paramètres :", e);
    return { id: null, companyName: "Mon entreprise", phone: "", footerText: "Devis valable 15 jours à compter de la date d'émission.", logo: null };
  }
}

export async function saveSettings(settings, accountId) {
  const row = {
    company_name: settings.companyName,
    phone: settings.phone,
    footer_text: settings.footerText,
    logo_base64: settings.logo,
    updated_at: new Date().toISOString(),
  };
  if (settings.id) {
    const { error } = await supabase.from("settings").update(row).eq("id", settings.id).eq("account_id", accountId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("settings").insert({ ...row, account_id: accountId });
    if (error) throw error;
  }
}

// ---------- équipe (profiles rattachés à ce compte) ----------
export async function fetchTeamMembers(accountId) {
  try {
    const { data, error } = await supabase.from("profiles").select("id, name, permissions, store_id").eq("account_id", accountId).order("name");
    if (error) throw error;
    return data.map(mapProfile);
  } catch (e) {
    console.error("Impossible de charger l'équipe :", e);
    return [];
  }
}
export async function updateTeamMemberPermissions(id, permissions, accountId) {
  const { error } = await supabase.from("profiles").update({ permissions }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function updateTeamMemberName(id, name, accountId) {
  const { error } = await supabase.from("profiles").update({ name }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function updateTeamMemberStore(id, storeId, accountId) {
  const { error } = await supabase.from("profiles").update({ store_id: storeId || null }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function deleteTeamMember(id, accountId) {
  const { error } = await supabase.from("profiles").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- invitations ----------
export async function fetchInvites(accountId) {
  try {
    const { data, error } = await supabase.from("invites").select("*").eq("account_id", accountId).order("created_at", { ascending: false });
    if (error) throw error;
    return data.map((i) => ({
      id: i.id, code: i.code, permissions: i.permissions || {},
      used: i.used, createdAt: i.created_at, expiresAt: i.expires_at, storeId: i.store_id || null,
    }));
  } catch (e) {
    console.error("Impossible de charger les invitations :", e);
    return [];
  }
}
export async function createInvite(accountId, permissions, storeId) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const { data, error } = await supabase.from("invites").insert({ account_id: accountId, code, permissions, store_id: storeId || null }).select().single();
  if (error) throw error;
  return { id: data.id, code: data.code };
}
export async function deleteInvite(id, accountId) {
  const { error } = await supabase.from("invites").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function joinCompanyWithInvite({ code, name, email, password }) {
  const { data: authData, error: e1 } = await supabaseSignup.auth.signUp({ email, password });
  if (e1) throw e1;
  if (!authData.session) throw new Error("Inscription incomplète (session manquante), réessaie.");
  const { error: e2 } = await supabaseSignup.rpc("join_company_with_invite", { p_code: code.trim().toUpperCase(), p_name: name });
  if (e2) throw e2;
  return true;
}

// ---------- recettes additionnelles (hors location) ----------
export async function fetchAdditionalRevenues(accountId, storeId) {
  try {
    const { data, error } = await supabase.from("additional_revenues").select("*").eq("account_id", accountId).eq("store_id", storeId).order("date", { ascending: false });
    if (error) throw error;
    return data.map((r) => ({ id: r.id, description: r.description, amount: Number(r.amount), category: r.category || "Autre", date: r.date }));
  } catch (e) {
    console.error("Impossible de charger les recettes additionnelles :", e);
    return [];
  }
}
export async function createAdditionalRevenue({ description, amount, category, date }, accountId, storeId) {
  const { error } = await supabase.from("additional_revenues").insert({ description, amount, category: category || "Autre", date, account_id: accountId, store_id: storeId });
  if (error) throw error;
}
export async function deleteAdditionalRevenue(id, accountId) {
  const { error } = await supabase.from("additional_revenues").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- dépenses ----------
export async function fetchExpenses(accountId, storeId) {
  try {
    const { data, error } = await supabase.from("expenses").select("*").eq("account_id", accountId).eq("store_id", storeId).order("date", { ascending: false });
    if (error) throw error;
    return data.map((r) => ({ id: r.id, description: r.description, amount: Number(r.amount), category: r.category || "Autre", date: r.date }));
  } catch (e) {
    console.error("Impossible de charger les dépenses :", e);
    return [];
  }
}
export async function createExpense({ description, amount, category, date }, accountId, storeId) {
  const { error } = await supabase.from("expenses").insert({ description, amount, category: category || "Autre", date, account_id: accountId, store_id: storeId });
  if (error) throw error;
}
export async function deleteExpense(id, accountId) {
  const { error } = await supabase.from("expenses").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ============================================================
// SUPER-ADMIN PLATEFORME (aucun filtre account_id : vue globale)
// ============================================================
export async function fetchAllAccounts() {
  const { data, error } = await supabase.from("accounts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapAccount);
}

export async function fetchAllUsers() {
  const { data, error } = await supabase.rpc("list_all_users");
  if (error) throw error;
  return data.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    companyName: u.company_name || "— (super-admin)",
    accountStatus: u.subscription_status,
    isPlatformAdmin: !!u.is_platform_admin,
    permissions: u.permissions || {},
    createdAt: u.created_at ? u.created_at.slice(0, 10) : null,
  }));
}

export async function updateAccountStatus(accountId, { status, trialEnd }) {
  const row = {};
  if (status) row.subscription_status = status;
  if (trialEnd) row.trial_end = trialEnd;
  const { error } = await supabase.from("accounts").update(row).eq("id", accountId);
  if (error) throw error;
}

export async function updateAccountPlan(accountId, plan) {
  const { error } = await supabase.from("accounts").update({ plan }).eq("id", accountId);
  if (error) throw error;
}

export async function deleteAccount(accountId) {
  // Supprime toutes les données du compte, dans l'ordre (enfants avant parents)
  const tables = [
    "reservation_items", "payments", "reservations",
    "pack_items", "packs", "clients", "drivers", "inventory",
    "settings", "additional_revenues", "expenses", "profiles",
  ];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("account_id", accountId);
    if (error) throw error;
  }
  const { error: eAcc } = await supabase.from("accounts").delete().eq("id", accountId);
  if (eAcc) throw eAcc;
}

// ---------- paiement (PayDunya, via nos fonctions serveur Vercel) ----------
export async function initiatePayment(accountId, plan) {
  const res = await fetch("/api/create-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, plan }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur lors de la création du paiement");
  return data.paymentUrl;
}

export async function fetchPlatformSettings() {
  try {
    const { data, error } = await supabase.from("platform_settings").select("*").limit(1).maybeSingle();
    if (error || !data) return { id: null, contactPhone: "" };
    return { id: data.id, contactPhone: data.contact_phone || "" };
  } catch (e) {
    console.error("Impossible de charger les paramètres plateforme :", e);
    return { id: null, contactPhone: "" };
  }
}

export async function savePlatformSettings(settings) {
  const row = { contact_phone: settings.contactPhone, updated_at: new Date().toISOString() };
  if (settings.id) {
    const { error } = await supabase.from("platform_settings").update(row).eq("id", settings.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("platform_settings").insert(row);
    if (error) throw error;
  }
}
