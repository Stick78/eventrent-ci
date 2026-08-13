import React, { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from "react";
import {
  LayoutDashboard, Package, CalendarDays, Users, Truck, Plus, X, Camera,
  AlertTriangle, ChevronLeft, ChevronRight, Trash2, Pencil, Phone, ShieldAlert,
  PackageCheck, Printer, Wallet, Loader2, FileDown, Settings as SettingsIcon,
  UserCog, BarChart3, LogOut, TrendingUp, Receipt, PiggyBank, ShieldCheck, BookOpen
} from "lucide-react";
import * as db from "./dataLayer";

const ZONES = [
  { id: "intra", label: "Abidjan intra-muros", fee: 2000 },
  { id: "peripherie", label: "Périphérie", fee: 5000 },
  { id: "interieur", label: "Intérieur du pays", fee: 15000 },
];
const PAYMENT_MODES = ["Mobile Money", "Espèces", "Virement", "Chèque"];
const STATUS_FLOW = ["En attente", "Confirmé", "Livré", "Retourné"];
const STATUS_COLORS = {
  "En attente": { bg: "#FBF0DA", fg: "#9A6A00" },
  "Confirmé": { bg: "#DCEAFB", fg: "#1D5FA8" },
  "Livré": { bg: "#DFF0E8", fg: "#1F6F4B" },
  "Retourné": { bg: "#EAE8E2", fg: "#5B564C" },
};
const MODULES = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "bilan", label: "Bilan", icon: BarChart3 },
  { id: "revenues", label: "Recettes", icon: Wallet },
  { id: "expenses", label: "Dépenses", icon: Receipt },
  { id: "inventory", label: "Inventaire", icon: Package },
  { id: "reservations", label: "Réservations", icon: CalendarDays },
  { id: "planning", label: "Planning", icon: CalendarDays },
  { id: "clients", label: "Clients", icon: Users },
  { id: "drivers", label: "Livreurs", icon: Truck },
  { id: "settings", label: "Paramètres", icon: SettingsIcon },
  { id: "users", label: "Équipe", icon: UserCog },
];
const NAVY = "#0F1B3D";
const BG = "#F5F6FA";
const BORDER = "#E5E7EB";
const TEXT_MUTED = "#6B7280";
const TEXT_DARK = "#111827";
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => (Number(n) || 0).toLocaleString("fr-FR") + " FCFA";
const fmtDate = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const reservationTotal = (r) => r.items.reduce((s, it) => s + it.qty * it.unit, 0) * (r.seasonal ? 1.2 : 1) + (ZONES.find((z) => z.id === r.zone)?.fee || 0);
const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const GUIDE_PDF_URL = "/guide-utilisation-eventrent-ci.pdf";

// Contexte : rend l'accountId courant accessible à tous les composants sans prop drilling
const AccountContext = createContext(null);
const useAccountId = () => useContext(AccountContext);

// ---------- Génération du devis PDF (personnalisable) ----------
function generateQuotePDF(r, data) {
  if (!window.jspdf) { alert("La librairie PDF n'a pas pu se charger. Vérifie ta connexion et réessaie."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const settings = data.settings || { companyName: "Mon entreprise", phone: "", footerText: "", logo: null };
  const zone = ZONES.find((z) => z.id === r.zone);
  const driver = data.drivers.find((d) => d.id === r.driverId);
  const subtotal = r.items.reduce((s, it) => s + it.qty * it.unit, 0);
  const seasonalFee = r.seasonal ? subtotal * 0.2 : 0;
  const zoneFee = zone?.fee || 0;
  const total = subtotal + seasonalFee + zoneFee;
  const paid = r.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(total - paid, 0);
  const docNumber = `DEV-${r.id.toString().slice(0, 8).toUpperCase()}`;

  const headerHeight = settings.phone ? 36 : 32;
  doc.setFillColor(20, 37, 30);
  doc.rect(0, 0, 210, headerHeight, "F");

  let textX = 14;
  if (settings.logo) {
    try {
      const match = settings.logo.match(/^data:image\/(png|jpe?g);base64,/i);
      const format = match ? match[1].toUpperCase().replace("JPG", "JPEG") : "PNG";
      doc.addImage(settings.logo, format, 14, 6, 22, 22);
      textX = 40;
    } catch (e) {
      console.error("Impossible d'insérer le logo dans le PDF :", e);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(undefined, "bold");
  doc.text(settings.companyName || "Mon entreprise", textX, 17);
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.setTextColor(200, 210, 205);
  doc.text("Location de matériel événementiel — Côte d'Ivoire", textX, 23);
  if (settings.phone) doc.text(`Tél : ${settings.phone}`, textX, 29);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("DEVIS", 196, 15, { align: "right" });
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text(docNumber, 196, 21, { align: "right" });
  doc.text(`Émis le ${fmtDate(todayISO())}`, 196, 26, { align: "right" });

  let y = headerHeight + 12;
  doc.setTextColor(20, 25, 20);
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("Client", 14, y);
  doc.setFont(undefined, "normal");
  doc.text(r.clientName || "—", 14, y + 6);

  doc.setFont(undefined, "bold");
  doc.text("Période de location", 110, y);
  doc.setFont(undefined, "normal");
  doc.text(`${fmtDate(r.startDate)}  →  ${fmtDate(r.endDate)}`, 110, y + 6);

  y += 16;
  doc.setFont(undefined, "bold");
  doc.text("Adresse de livraison", 14, y);
  doc.setFont(undefined, "normal");
  doc.text(r.address || "Non renseignée", 14, y + 6);
  doc.text(`Zone : ${zone?.label || "—"}`, 14, y + 12);

  doc.setFont(undefined, "bold");
  doc.text("Livreur", 110, y);
  doc.setFont(undefined, "normal");
  doc.text(driver ? `${driver.name} (${driver.type === "externe" ? "freelance" : "interne"})` : "Non assigné", 110, y + 6);

  const rows = r.items.map((it) => [it.name, String(it.qty), fmt(it.unit), fmt(it.qty * it.unit)]);
  doc.autoTable({
    startY: y + 20,
    head: [["Article", "Qté", "Prix unitaire", "Sous-total"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [31, 111, 75], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });

  let finalY = doc.lastAutoTable.finalY + 8;
  const totalsLine = (label, value, bold) => {
    doc.setFont(undefined, bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 10);
    doc.text(label, 140, finalY, { align: "right" });
    doc.text(value, 196, finalY, { align: "right" });
    finalY += bold ? 8 : 6;
  };
  totalsLine("Sous-total articles", fmt(subtotal), false);
  if (r.seasonal) totalsLine("Majoration haute saison (+20%)", fmt(seasonalFee), false);
  if (zoneFee > 0) totalsLine("Frais de livraison", fmt(zoneFee), false);
  doc.setDrawColor(220, 220, 220);
  doc.line(140, finalY - 2, 196, finalY - 2);
  totalsLine("TOTAL", fmt(total), true);
  totalsLine("Déjà payé", fmt(paid), false);
  totalsLine("Reste à payer", fmt(remaining), true);

  finalY += 4;
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`Caution demandée : ${fmt(r.caution)}`, 14, finalY);

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  const footer = settings.footerText || "Devis valable 15 jours à compter de la date d'émission.";
  doc.text(`${settings.companyName || "Mon entreprise"} — ${footer}`, 14, 285);
  doc.text("Ce document ne constitue pas une facture.", 14, 290);

  doc.save(`${docNumber}-${(r.clientName || "client").replace(/\s+/g, "_")}.pdf`);
}

// ============================================================
// App racine : gère la session Supabase Auth
// ============================================================
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = pas encore vérifié, null = pas connecté
  const [profile, setProfile] = useState(null);
  const [account, setAccount] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup" | "join"
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let sub;
    (async () => {
      const s = await db.getSession();
      setSession(s || null);
      sub = db.onAuthStateChange((event, newSession) => {
        if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
        setSession(newSession);
      });
    })();
    return () => { if (sub) sub.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setProfile(null); setAccount(null); return; }
    db.fetchProfile(session.user.id)
      .then(async (p) => {
        setProfile(p);
        if (!p.isPlatformAdmin && p.accountId) {
          const acc = await db.fetchAccount(p.accountId);
          setAccount(acc);
        }
      })
      .catch((e) => { console.error(e); setLoadError("Impossible de charger ton profil. Contacte le support."); });
  }, [session]);

  const handleLogout = async () => {
    await db.signOut();
    setProfile(null);
    setAccount(null);
  };

  if (session === undefined) {
    return <FullScreenLoader />;
  }
  if (recoveryMode) {
    return <ResetPasswordScreen onDone={() => setRecoveryMode(false)} onLogout={handleLogout} />;
  }
  if (!session) {
    if (authMode === "signup") return <SignupScreen onBackToLogin={() => setAuthMode("login")} />;
    if (authMode === "join") return <JoinScreen onBackToLogin={() => setAuthMode("login")} />;
    return <LoginScreen onShowSignup={() => setAuthMode("signup")} onShowJoin={() => setAuthMode("join")} />;
  }
  if (loadError) {
    return <FullScreenMessage title="Erreur" message={loadError} onLogout={handleLogout} />;
  }
  if (!profile) {
    return <FullScreenLoader />;
  }
  if (profile.isPlatformAdmin) {
    return <PlatformAdminApp profile={profile} onLogout={handleLogout} />;
  }
  if (!profile.accountId || !account) {
    return <FullScreenMessage title="Compte non configuré" message="Ton profil n'est rattaché à aucune entreprise. Contacte le support." onLogout={handleLogout} />;
  }

  const daysLeft = Math.ceil((new Date(account.trialEnd) - new Date()) / (1000 * 60 * 60 * 24));
  const isBlocked = account.status === "cancelled" || account.status === "expired" || (account.status === "trial" && daysLeft < 0);
  if (isBlocked) {
    return <TrialExpiredScreen account={account} onLogout={handleLogout} />;
  }

  return <TenantApp profile={profile} account={account} daysLeft={daysLeft} onLogout={handleLogout} />;
}function FullScreenLoader() {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG, color: TEXT_MUTED, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
    <Loader2 className="spin" size={20} style={{ marginRight: 8 }} /> Chargement...
  </div>;
}
function FullScreenMessage({ title, message, onLogout }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
    <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 360, textAlign: "center" }}>
      <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: TEXT_MUTED, marginBottom: 16 }}>{message}</div>
      <Btn onClick={onLogout} variant="ghost">Se déconnecter</Btn>
    </div>
  </div>;
}

// ---------- Connexion (Supabase Auth) ----------
function GuideLink() {
  return <div style={{ textAlign: "center", marginTop: 16 }}>
    <a href={GUIDE_PDF_URL} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9BAFC9", textDecoration: "none" }}>
      <BookOpen size={13} /> Consulter le guide d'utilisation (PDF)
    </a>
  </div>;
}

function LoginScreen({ onShowSignup, onShowJoin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setError(""); setLoading(true);
    try {
      await db.signIn(email.trim(), password);
    } catch (e) {
      console.error(e);
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
    }
  };

  const submitForgot = async () => {
    if (!email) return;
    setError(""); setLoading(true);
    try {
      await db.sendPasswordReset(email.trim());
      setForgotSent(true);
    } catch (e) {
      console.error(e);
      setError("Impossible d'envoyer l'email. Vérifie l'adresse et réessaie.");
    } finally { setLoading(false); }
  };

  if (forgotMode) {
    return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
      <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 320 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Mot de passe oublié</div>
        {forgotSent ? (
          <>
            <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginBottom: 20 }}>
              Un email vient de t'être envoyé à <b>{email}</b>. Clique sur le lien qu'il contient pour choisir un nouveau mot de passe.
            </div>
            <Btn variant="ghost" onClick={() => { setForgotMode(false); setForgotSent(false); }}>Retour à la connexion</Btn>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginBottom: 20 }}>Indique ton email, tu recevras un lien pour choisir un nouveau mot de passe.</div>
            <Field label="Email">
              <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitForgot()} autoFocus />
            </Field>
            {error && <div style={{ color: "#B3261E", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            <Btn disabled={loading} onClick={submitForgot}>{loading ? "Envoi..." : "Envoyer le lien"}</Btn>
            <div style={{ textAlign: "center", marginTop: 16, fontSize: 12.5, color: TEXT_MUTED }}>
              <span onClick={() => { setForgotMode(false); setError(""); }} style={{ color: "#1F6F4B", fontWeight: 700, cursor: "pointer" }}>Retour à la connexion</span>
            </div>
          </>
        )}
      </div>
      <GuideLink />
    </div>;
  }

  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
    <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 320 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1F6F4B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: "#fff" }}>ER</div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>EventRent <span style={{ color: "#C9A227" }}>CI</span></div>
      </div>
      <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginBottom: 20 }}>Connexion</div>
      <Field label="Email">
        <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
      </Field>
      <Field label="Mot de passe">
        <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </Field>
      {error && <div style={{ color: "#B3261E", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <Btn disabled={loading} onClick={submit}>{loading ? "Connexion..." : "Se connecter"}</Btn>
      <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: TEXT_MUTED }}>
        <span onClick={() => { setForgotMode(true); setError(""); }} style={{ color: TEXT_MUTED, textDecoration: "underline", cursor: "pointer" }}>Mot de passe oublié ?</span>
      </div>
      <div style={{ textAlign: "center", marginTop: 12, fontSize: 12.5, color: TEXT_MUTED }}>
        Nouvelle entreprise ? <span onClick={onShowSignup} style={{ color: "#1F6F4B", fontWeight: 700, cursor: "pointer" }}>Créer mon compte</span>
      </div>
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 12.5, color: TEXT_MUTED }}>
        Un code d'invitation ? <span onClick={onShowJoin} style={{ color: "#1F6F4B", fontWeight: 700, cursor: "pointer" }}>Rejoindre une entreprise</span>
      </div>
    </div>
    <GuideLink />
  </div>;
}

// ---------- Réinitialisation du mot de passe (via lien reçu par email) ----------
function ResetPasswordScreen({ onDone, onLogout }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return; }
    if (password !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setError(""); setLoading(true);
    try {
      await db.updatePassword(password);
      setDone(true);
    } catch (e) {
      console.error(e);
      setError("Impossible de mettre à jour le mot de passe. Réessaie.");
    } finally { setLoading(false); }
  };

  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
    <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 320 }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Nouveau mot de passe</div>
      {done ? (
        <>
          <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginBottom: 20 }}>Ton mot de passe a bien été mis à jour.</div>
          <Btn onClick={onDone}>Continuer</Btn>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginBottom: 20 }}>Choisis un nouveau mot de passe pour ton compte.</div>
          <Field label="Nouveau mot de passe (6 caractères min.)">
            <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <Field label="Confirme le mot de passe">
            <input type="password" style={inputStyle} value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </Field>
          {error && <div style={{ color: "#B3261E", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          <Btn disabled={loading} onClick={submit}>{loading ? "Enregistrement..." : "Mettre à jour le mot de passe"}</Btn>
          <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: TEXT_MUTED }}>
            <span onClick={onLogout} style={{ color: TEXT_MUTED, textDecoration: "underline", cursor: "pointer" }}>Annuler et se déconnecter</span>
          </div>
        </>
      )}
    </div>
  </div>;
}

// ---------- Inscription (essai gratuit 14 jours) ----------
function SignupScreen({ onBackToLogin }) {
  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null); // { needsEmailConfirmation }

  const submit = async () => {
    if (!companyName || !adminName || !email || !password) return;
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return; }
    setError(""); setLoading(true);
    try {
      const result = await db.signUpCompany({ companyName, adminName, email: email.trim(), password });
      setDone(result);
    } catch (e) {
      console.error(e);
      setError(e.message?.includes("already registered") ? "Cet email est déjà utilisé." : "Erreur lors de l'inscription. Réessaie.");
    } finally { setLoading(false); }
  };

  if (done) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
      <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 340, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Ton essai gratuit de 14 jours a démarré !</div>
        {done.needsEmailConfirmation
          ? <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 16 }}>Vérifie ta boîte mail pour confirmer ton adresse, puis reviens te connecter.</div>
          : <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 16 }}>Tu peux te connecter dès maintenant.</div>}
        <Btn onClick={onBackToLogin}>Retour à la connexion</Btn>
      </div>
    </div>;
  }

  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
    <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 360 }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Créer mon entreprise</div>
      <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginBottom: 20 }}>14 jours d'essai gratuit, sans engagement</div>
      <Field label="Nom de l'entreprise"><input style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="off" name="signup-company" /></Field>
      <Field label="Ton nom"><input style={inputStyle} value={adminName} onChange={(e) => setAdminName(e.target.value)} autoComplete="off" name="signup-admin-name" /></Field>
      <Field label="Email"><input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" name="signup-email" /></Field>
      <Field label="Mot de passe (6 caractères min.)"><input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" name="signup-password" /></Field>
      {error && <div style={{ color: "#B3261E", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <Btn disabled={loading} onClick={submit}>{loading ? "Création..." : "Démarrer l'essai gratuit"}</Btn>
      <div style={{ textAlign: "center", marginTop: 16, fontSize: 12.5, color: TEXT_MUTED }}>
        Déjà un compte ? <span onClick={onBackToLogin} style={{ color: "#1F6F4B", fontWeight: 700, cursor: "pointer" }}>Se connecter</span>
      </div>
    </div>
    <GuideLink />
  </div>;
}

// ---------- Rejoindre une entreprise existante (avec code d'invitation) ----------
function JoinScreen({ onBackToLogin }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!code || !name || !email || !password) return;
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return; }
    setError(""); setLoading(true);
    try {
      await db.joinCompanyWithInvite({ code, name, email: email.trim(), password });
      setDone(true);
    } catch (e) {
      console.error(e);
      const msg = e.message?.includes("already registered") ? "Cet email est déjà utilisé."
        : e.message?.includes("invalide ou expiré") ? "Code d'invitation invalide ou expiré."
        : "Erreur lors de l'inscription. Vérifie le code et réessaie.";
      setError(msg);
    } finally { setLoading(false); }
  };

  if (done) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
      <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 340, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Bienvenue dans l'équipe !</div>
        <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 16 }}>Tu peux te connecter dès maintenant.</div>
        <Btn onClick={onBackToLogin}>Retour à la connexion</Btn>
      </div>
    </div>;
  }

  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: NAVY, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
    <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 360 }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Rejoindre une entreprise</div>
      <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginBottom: 20 }}>Utilise le code fourni par ton administrateur</div>
      <Field label="Code d'invitation"><input style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="EX: AB12CD" /></Field>
      <Field label="Ton nom"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" name="join-name" /></Field>
      <Field label="Email"><input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" name="join-email" /></Field>
      <Field label="Mot de passe (6 caractères min.)"><input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" name="join-password" /></Field>
      {error && <div style={{ color: "#B3261E", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <Btn disabled={loading} onClick={submit}>{loading ? "Connexion..." : "Rejoindre l'entreprise"}</Btn>
      <div style={{ textAlign: "center", marginTop: 16, fontSize: 12.5, color: TEXT_MUTED }}>
        <span onClick={onBackToLogin} style={{ color: "#1F6F4B", fontWeight: 700, cursor: "pointer" }}>Retour à la connexion</span>
      </div>
    </div>
    <GuideLink />
  </div>;
}

function TrialExpiredScreen({ account, onLogout }) {
  const [contactPhone, setContactPhone] = useState(null);
  useEffect(() => { db.fetchPlatformSettings().then((s) => setContactPhone(s.contactPhone)); }, []);
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
    <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 380, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
      <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>
        {account.status === "cancelled" ? "Compte résilié" : "Ton essai gratuit est terminé"}
      </div>
      <div style={{ fontSize: 13.5, color: TEXT_MUTED, marginBottom: 20 }}>
        Pour continuer à utiliser EventRent CI, contacte-nous pour activer ton abonnement.
      </div>
      {contactPhone && <div style={{ fontSize: 13, marginBottom: 20 }}>📞 Contact : {contactPhone}</div>}
      <Btn onClick={onLogout} variant="ghost">Se déconnecter</Btn>
    </div>
  </div>;
}

// ============================================================
// Application "entreprise cliente" (tout ce qu'on avait déjà)
// ============================================================
function TenantApp({ profile, account, daysLeft, onLogout }) {
  const [tab, setTab] = useState("reservations");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const d = await db.fetchAll(profile.accountId);
      setData(d);
      setError(null);
    } catch (e) {
      console.error(e);
      setError(e.message || "Erreur de connexion à la base");
    }
  }, [profile.accountId]);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { console.error(e); setError(e.message || "Une erreur est survenue"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!profile.permissions?.[tab]) {
      const firstAllowed = MODULES.find((m) => profile.permissions?.[m.id]);
      if (firstAllowed) setTab(firstAllowed.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (!data) return <FullScreenLoader />;

  const nav = MODULES.filter((m) => profile.permissions?.[m.id]);
  const hasAccess = (id) => !!profile.permissions?.[id];
  const isAdmin = !!profile.permissions?.users;

  return (
    <AccountContext.Provider value={profile.accountId}>
      <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif", background: BG, minHeight: "100vh", color: TEXT_DARK, display: "flex" }}>
        <style>{`
          * { box-sizing: border-box; }
          button { font-family: inherit; cursor: pointer; }
          input, select, textarea { font-family: inherit; }
          ::-webkit-scrollbar { width: 8px; height: 8px; }
          ::-webkit-scrollbar-thumb { background: #D8D4C8; border-radius: 4px; }
        `}</style>

        <div style={{ width: 210, background: NAVY, color: "#EFEDE6", padding: "20px 12px", flexShrink: 0, position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ padding: "0 8px 20px 8px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {data.settings?.logo
                ? <img src={data.settings.logo} alt="Logo" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "#fff" }} />
                : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1F6F4B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, flexShrink: 0 }}>ER</div>}
              <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{data.settings?.companyName || "EventRent CI"}</div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {isAdmin && <Badge text="ADMIN" bg="rgba(255,255,255,0.15)" fg="#fff" />}
            </div>
            <div style={{ fontSize: 11, color: "#9BAFC9", marginTop: 6 }}>Connecté à Supabase</div>
          </div>
          <div style={{ flex: "1 0 auto" }}>
            {nav.map((n) => {
              const Icon = n.icon; const active = tab === n.id;
              return (
                <div key={n.id} onClick={() => setTab(n.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 8, marginBottom: 4,
                  background: active ? "#1F6F4B" : "transparent", color: active ? "#fff" : "#CBD5CC",
                  fontSize: 13.5, fontWeight: active ? 700 : 500,
                }}>
                  <Icon size={16} /> {n.label}
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid #24304F", paddingTop: 12, marginTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{profile.name}</div>
            <a href={GUIDE_PDF_URL} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9BAFC9", textDecoration: "none", marginBottom: 8 }}>
              <BookOpen size={13} /> Aide (guide PDF)
            </a>
            <div onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9BAFC9", cursor: "pointer" }}>
              <LogOut size={13} /> Déconnexion
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: 24, maxWidth: 1100 }}>
          {account.status === "trial" && (
            <div style={{ background: daysLeft <= 3 ? "#FBEAE8" : "#FEFAEF", color: daysLeft <= 3 ? "#B3261E" : "#9A6A00", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
              ⏳ Essai gratuit : {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}
            </div>
          )}
          {error && (
            <div style={{ background: "#FBEAE8", color: "#B3261E", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13.5 }}>
              ⚠ {error}
            </div>
          )}
          {tab === "dashboard" && hasAccess("dashboard") && <Dashboard data={data} />}
          {tab === "bilan" && hasAccess("bilan") && <Bilan data={data} />}
          {tab === "revenues" && hasAccess("revenues") && <Recettes data={data} run={run} busy={busy} />}
          {tab === "expenses" && hasAccess("expenses") && <Depenses data={data} run={run} busy={busy} />}
          {tab === "inventory" && hasAccess("inventory") && <Inventory data={data} run={run} busy={busy} />}
          {tab === "reservations" && hasAccess("reservations") && <Reservations data={data} run={run} busy={busy} />}
          {tab === "planning" && hasAccess("planning") && <Planning data={data} />}
          {tab === "clients" && hasAccess("clients") && <Clients data={data} run={run} />}
          {tab === "drivers" && hasAccess("drivers") && <Drivers data={data} run={run} />}
          {tab === "settings" && hasAccess("settings") && <SettingsPage data={data} run={run} busy={busy} />}
          {tab === "users" && hasAccess("users") && <TeamPage data={data} run={run} profile={profile} />}
          {nav.length === 0 && <div style={{ color: TEXT_MUTED, fontSize: 13.5 }}>Aucun module ne t'a été attribué. Contacte un administrateur.</div>}
        </div>
      </div>
    </AccountContext.Provider>
  );
}

// ---------- shared UI ----------
function Card({ children, style }) { return <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, boxShadow: "0 1px 2px rgba(16,24,40,0.03)", ...style }}>{children}</div>; }
function SectionTitle({ children, action }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
    <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{children}</h2>{action}
  </div>;
}
function Btn({ children, onClick, variant = "primary", small, icon: Icon, disabled }) {
  const styles = { primary: { background: "#1F6F4B", color: "#fff" }, ghost: { background: "#F1F2F6", color: TEXT_DARK }, danger: { background: "#FBEAE8", color: "#B3261E" }, gold: { background: "#C9A227", color: "#1F2421" } };
  return <button disabled={disabled} onClick={onClick} style={{ ...styles[variant], opacity: disabled ? 0.6 : 1, border: "none", borderRadius: 8, padding: small ? "6px 10px" : "9px 14px", fontSize: small ? 12.5 : 13.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
    {Icon && <Icon size={small ? 13 : 15} />} {children}
  </button>;
}
function Badge({ text, bg, fg }) { return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999 }}>{text}</span>; }
function Field({ label, children }) { return <div style={{ marginBottom: 12 }}><label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#5B564C", marginBottom: 5 }}>{label}</label>{children}</div>; }
const inputStyle = { width: "100%", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: 7, fontSize: 13.5, background: "#FAFBFC" };
function Modal({ title, onClose, children, width = 520 }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,61,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
    <div style={{ background: "#fff", borderRadius: 12, width, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", padding: 20 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800 }}>{title}</h3>
        <X size={18} onClick={onClose} style={{ cursor: "pointer", color: "#8A857A" }} />
      </div>
      {children}
    </div>
  </div>;
}
function PageBanner({ icon: Icon, title, subtitle }) {
  return <div style={{ background: NAVY, color: "#fff", borderRadius: 12, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
    {Icon && <Icon size={22} />}
    <div>
      <div style={{ fontWeight: 800, fontSize: 19 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12.5, color: "#9BAFC9", marginTop: 2 }}>{subtitle}</div>}
    </div>
  </div>;
}
function KpiCard({ icon: Icon, label, value, sub, color }) {
  return <div style={{ background: "#fff", borderRadius: 10, border: `1px solid ${BORDER}`, borderLeftWidth: 4, borderLeftColor: color, padding: 16, boxShadow: "0 1px 2px rgba(16,24,40,0.03)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: color + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color={color} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
    </div>
    <div style={{ fontSize: 21, fontWeight: 800, color: TEXT_DARK }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
  </div>;
}
function DailyRevenueChart({ data }) {
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().slice(0, 10); });
  const revenueByDay = days.map((day) => {
    let s = 0;
    data.reservations.forEach((r) => r.payments.forEach((p) => { if (p.date === day) s += p.amount; }));
    data.additionalRevenues.forEach((rev) => { if (rev.date === day) s += rev.amount; });
    return { day, value: s };
  });
  const max = Math.max(...revenueByDay.map((d) => d.value), 1);
  return <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 180, padding: "10px 4px 0" }}>
    {revenueByDay.map((d) => (
      <div key={d.day} title={`${fmtDate(d.day)} : ${fmt(d.value)}`} style={{ flex: 1, minWidth: 3, height: `${Math.max((d.value / max) * 100, 2)}%`, background: d.value > 0 ? "#93B4E8" : "#EEF1F6", borderRadius: "3px 3px 0 0" }} />
    ))}
  </div>;
}

// ---------- Dashboard ----------
function Dashboard({ data }) {
  const now = new Date();  const monthKey = todayISO().slice(0, 7);
  const prevMonthKey = useMemo(() => { const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`; }, []);

  const revenueMonth = useMemo(() => {
    let s = 0;
    data.reservations.forEach((r) => r.payments.forEach((p) => { if ((p.date || "").slice(0, 7) === monthKey) s += p.amount; }));
    data.additionalRevenues.forEach((rev) => { if ((rev.date || "").slice(0, 7) === monthKey) s += rev.amount; });
    return s;
  }, [data, monthKey]);
  const revenuePrevMonth = useMemo(() => {
    let s = 0;
    data.reservations.forEach((r) => r.payments.forEach((p) => { if ((p.date || "").slice(0, 7) === prevMonthKey) s += p.amount; }));
    data.additionalRevenues.forEach((rev) => { if ((rev.date || "").slice(0, 7) === prevMonthKey) s += rev.amount; });
    return s;
  }, [data, prevMonthKey]);
  const revenueEvolution = revenuePrevMonth === 0 ? (revenueMonth > 0 ? 100 : 0) : Math.round(((revenueMonth - revenuePrevMonth) / revenuePrevMonth) * 100);

  const expensesMonth = useMemo(() => data.expenses.filter((e) => (e.date || "").slice(0, 7) === monthKey).reduce((s, e) => s + e.amount, 0), [data, monthKey]);
  const grossMargin = revenueMonth - expensesMonth;

  const upcoming = data.reservations.filter((r) => r.startDate >= todayISO() && r.status !== "Retourné").length;
  const onRent = data.reservations.filter((r) => r.status === "Livré").length;
  const lowStock = data.inventory.filter((i) => i.total <= i.low);
  const newClientsThisMonth = data.clients.filter((c) => c.createdAt && c.createdAt.slice(0, 7) === monthKey).length;
  const cautionsHeld = data.reservations.filter((r) => r.status !== "Retourné" && r.caution > 0).reduce((s, r) => s + r.caution, 0);

  const topItems = useMemo(() => {
    const qtyByItem = {};
    data.reservations.forEach((r) => r.items.forEach((it) => { qtyByItem[it.name] = (qtyByItem[it.name] || 0) + it.qty; }));
    return Object.entries(qtyByItem).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [data]);

  return <div>
    <PageBanner icon={LayoutDashboard} title="Tableau de bord" subtitle={`${data.settings?.companyName || "EventRent CI"} · ${MONTHS_FR[now.getMonth()]} ${now.getFullYear()}`} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
      <KpiCard icon={Wallet} label="Revenus du mois" value={fmt(revenueMonth)} color="#2F6FED" />
      <KpiCard icon={CalendarDays} label="Réservations à venir" value={upcoming} color="#7C5CFC" />
      <KpiCard icon={Package} label="Matériel en location" value={`${onRent} commande(s)`} color="#E0507B" />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
      <KpiCard icon={TrendingUp} label="Évolution des revenus" value={`${revenueEvolution >= 0 ? "+" : ""}${revenueEvolution}%`} sub="vs mois précédent" color="#2BA8C4" />
      <KpiCard icon={Users} label="Nouveaux clients ce mois" value={newClientsThisMonth} color="#E8A23D" />
      <KpiCard icon={ShieldAlert} label="Cautions non restituées" value={fmt(cautionsHeld)} color="#1F9D63" />
      <KpiCard icon={PiggyBank} label="Marge brute (mois)" value={fmt(grossMargin)} sub="Recettes − Dépenses" color={grossMargin >= 0 ? "#1F9D63" : "#B3261E"} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 20 }}>
      <Card>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Revenus encaissés (30 derniers jours)</div>
        <DailyRevenueChart data={data} />
      </Card>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, marginBottom: 10 }}><AlertTriangle size={15} color="#C9A227" /> Alertes stock</div>
        {lowStock.length === 0 && <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>Aucune alerte pour l'instant.</div>}
        {lowStock.map((i) => <div key={i.id} style={{ fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid #F0EEE7" }}>
          <div style={{ fontWeight: 700 }}>{i.name}</div>
          <div style={{ color: TEXT_MUTED }}>{i.total} en stock (seuil {i.low})</div>
        </div>)}
      </Card>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Card>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Dernières réservations</div>
        {data.reservations.slice(-5).reverse().map((r) => <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0EEE7", fontSize: 13.5 }}>
          <span>{r.clientName} — {r.startDate}</span>
          <Badge text={r.status} bg={STATUS_COLORS[r.status].bg} fg={STATUS_COLORS[r.status].fg} />
        </div>)}
        {data.reservations.length === 0 && <div style={{ color: TEXT_MUTED, fontSize: 13.5 }}>Aucune réservation pour l'instant.</div>}
      </Card>
      <Card>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Articles les plus loués</div>
        {topItems.map(([name, qty], i) => <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0EEE7", fontSize: 13.5 }}>
          <span>{i + 1}. {name}</span><b>{qty}×</b>
        </div>)}
        {topItems.length === 0 && <div style={{ color: TEXT_MUTED, fontSize: 13.5 }}>Aucune donnée pour l'instant.</div>}
      </Card>
    </div>
  </div>;
}

// ---------- Bilan ----------
function Bilan({ data }) {
  const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());

  const reservationsInRange = data.reservations.filter((r) => r.startDate >= from && r.startDate <= to);
  const allPaymentsInRange = [];
  data.reservations.forEach((r) => r.payments.forEach((p) => { if (p.date >= from && p.date <= to) allPaymentsInRange.push(p); }));
  const manualRevenuesInRange = data.additionalRevenues.filter((r) => r.date >= from && r.date <= to);

  const totalRevenue = allPaymentsInRange.reduce((s, p) => s + p.amount, 0) + manualRevenuesInRange.reduce((s, r) => s + r.amount, 0);
  const totalBilled = reservationsInRange.reduce((s, r) => s + reservationTotal(r), 0);
  const totalOutstanding = Math.max(totalBilled - reservationsInRange.reduce((s, r) => s + r.payments.reduce((s2, p) => s2 + p.amount, 0), 0), 0);
  const byMode = PAYMENT_MODES.map((mode) => ({ mode, total: allPaymentsInRange.filter((p) => p.mode === mode).reduce((s, p) => s + p.amount, 0) }));
  const manualRevenuesTotal = manualRevenuesInRange.reduce((s, r) => s + r.amount, 0);

  return <div>
    <PageBanner icon={BarChart3} title="Bilan" subtitle="Activité, recettes et réservations sur la période" />
    <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
      <Field label="Du"><input type="date" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="Au"><input type="date" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
      <KpiCard icon={Wallet} label="Revenus encaissés" value={fmt(totalRevenue)} color="#2F6FED" />
      <KpiCard icon={FileDown} label="Facturé (période)" value={fmt(totalBilled)} color="#7C5CFC" />
      <KpiCard icon={AlertTriangle} label="Reste à percevoir" value={fmt(totalOutstanding)} color="#E0507B" />
    </div>
    <Card style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Encaissements par mode de paiement</div>
      {byMode.map((b) => <div key={b.mode} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EEE7", fontSize: 13 }}>
        <span>{b.mode}</span><b>{fmt(b.total)}</b>
      </div>)}
      {manualRevenuesTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
        <span>Recettes manuelles (hors location)</span><b>{fmt(manualRevenuesTotal)}</b>
      </div>}
    </Card>
    <Card style={{ padding: 0 }}>
      <div style={{ fontWeight: 800, padding: "14px 16px 0" }}>Réservations créées sur la période ({reservationsInRange.length})</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10 }}>
        <thead><tr style={{ textAlign: "left", background: "#FAF9F5" }}>
          {["Client", "Dates", "Statut", "Total", "Payé", "Reste"].map((h) => <th key={h} style={{ padding: "8px 12px", fontSize: 11, color: TEXT_MUTED, fontWeight: 700 }}>{h}</th>)}
        </tr></thead>
        <tbody>{reservationsInRange.map((r) => {
          const total = reservationTotal(r);
          const paid = r.payments.reduce((s, p) => s + p.amount, 0);
          return <tr key={r.id} style={{ borderTop: "1px solid #F0EEE7" }}>
            <td style={{ padding: "8px 12px" }}>{r.clientName}</td>
            <td style={{ padding: "8px 12px", color: "#5B564C" }}>{r.startDate} → {r.endDate}</td>
            <td style={{ padding: "8px 12px" }}><Badge text={r.status} bg={STATUS_COLORS[r.status].bg} fg={STATUS_COLORS[r.status].fg} /></td>
            <td style={{ padding: "8px 12px" }}>{fmt(total)}</td>
            <td style={{ padding: "8px 12px", color: paid >= total ? "#1F6F4B" : "#B3261E" }}>{fmt(paid)}</td>
            <td style={{ padding: "8px 12px" }}>{fmt(Math.max(total - paid, 0))}</td>
          </tr>;
        })}</tbody>
      </table>
      {reservationsInRange.length === 0 && <div style={{ padding: 16, color: TEXT_MUTED, fontSize: 13 }}>Aucune réservation sur cette période.</div>}
    </Card>
  </div>;
}

// ---------- Recettes ----------
function Recettes({ data, run, busy }) {
  const accountId = useAccountId();
  const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [modal, setModal] = useState(false);

  const rentalRevenues = [];
  data.reservations.forEach((r) => r.payments.forEach((p) => {
    if (p.date >= from && p.date <= to) rentalRevenues.push({ id: p.id, date: p.date, description: `Location — ${r.clientName}`, category: "Location", amount: p.amount, source: "location" });
  }));
  const manualRevenues = data.additionalRevenues.filter((r) => r.date >= from && r.date <= to).map((r) => ({ ...r, source: "manuel" }));
  const all = [...rentalRevenues, ...manualRevenues].sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = all.reduce((s, r) => s + r.amount, 0);

  const removeManual = (id) => { if (confirm("Supprimer cette recette ?")) run(() => db.deleteAdditionalRevenue(id, accountId)); };

  return <div>
    <PageBanner icon={Wallet} title="Recettes" subtitle="Toutes les recettes encaissées, filtrables par date" />
    <div style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
      <Field label="Du"><input type="date" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="Au"><input type="date" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <Btn icon={Plus} disabled={busy} onClick={() => setModal(true)}>Ajouter une recette</Btn>
    </div>
    <Card style={{ marginBottom: 18, maxWidth: 320 }}>
      <div style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: 700 }}>TOTAL RECETTES (PÉRIODE)</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{fmt(total)}</div>
    </Card>
    <Card style={{ padding: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ textAlign: "left", background: "#FAF9F5" }}>
          {["Date", "Description", "Catégorie", "Montant", ""].map((h) => <th key={h} style={{ padding: "10px 12px", fontSize: 11, color: TEXT_MUTED, fontWeight: 700 }}>{h}</th>)}
        </tr></thead>
        <tbody>{all.map((r) => <tr key={`${r.source}-${r.id}`} style={{ borderTop: "1px solid #F0EEE7" }}>
          <td style={{ padding: "10px 12px" }}>{fmtDate(r.date)}</td>
          <td style={{ padding: "10px 12px" }}>{r.description}</td>
          <td style={{ padding: "10px 12px" }}><Badge text={r.category} bg={r.source === "location" ? "#DFF0E8" : "#DCEAFB"} fg={r.source === "location" ? "#1F6F4B" : "#1D5FA8"} /></td>
          <td style={{ padding: "10px 12px", fontWeight: 700 }}>{fmt(r.amount)}</td>
          <td style={{ padding: "10px 12px", textAlign: "right" }}>{r.source === "manuel" && <Trash2 size={14} style={{ cursor: "pointer", color: "#B3261E" }} onClick={() => removeManual(r.id)} />}</td>
        </tr>)}</tbody>
      </table>
      {all.length === 0 && <div style={{ padding: 16, color: TEXT_MUTED, fontSize: 13 }}>Aucune recette sur cette période.</div>}
    </Card>
    {modal && <RevenueModal onClose={() => setModal(false)} run={run} />}
  </div>;
}

function RevenueModal({ onClose, run }) {
  const accountId = useAccountId();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Autre");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!description || !amount) return;
    setSaving(true);
    try { await run(() => db.createAdditionalRevenue({ description, amount: +amount, category, date }, accountId)); onClose(); }
    finally { setSaving(false); }
  };
  return <Modal title="Ajouter une recette" onClose={onClose}>
    <Field label="Description"><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Vente de matériel usagé" /></Field>
    <Field label="Catégorie"><input style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Vente, Prestation, Autre" /></Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Montant (FCFA)"><input type="number" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Date"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </div>
    <Btn disabled={saving} onClick={save}>{saving ? "Enregistrement..." : "Enregistrer"}</Btn>
  </Modal>;
}

// ---------- Dépenses ----------
function Depenses({ data, run, busy }) {
  const accountId = useAccountId();
  const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [modal, setModal] = useState(false);

  const list = data.expenses.filter((e) => e.date >= from && e.date <= to).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = list.reduce((s, e) => s + e.amount, 0);
  const remove = (id) => { if (confirm("Supprimer cette dépense ?")) run(() => db.deleteExpense(id, accountId)); };

  return <div>
    <PageBanner icon={Receipt} title="Dépenses" subtitle="Toutes les dépenses, filtrables par date" />
    <div style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
      <Field label="Du"><input type="date" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="Au"><input type="date" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <Btn icon={Plus} disabled={busy} onClick={() => setModal(true)}>Ajouter une dépense</Btn>
    </div>
    <Card style={{ marginBottom: 18, maxWidth: 320 }}>
      <div style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: 700 }}>TOTAL DÉPENSES (PÉRIODE)</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: "#B3261E" }}>{fmt(total)}</div>
    </Card>
    <Card style={{ padding: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ textAlign: "left", background: "#FAF9F5" }}>
          {["Date", "Description", "Catégorie", "Montant", ""].map((h) => <th key={h} style={{ padding: "10px 12px", fontSize: 11, color: TEXT_MUTED, fontWeight: 700 }}>{h}</th>)}
        </tr></thead>
        <tbody>{list.map((e) => <tr key={e.id} style={{ borderTop: "1px solid #F0EEE7" }}>
          <td style={{ padding: "10px 12px" }}>{fmtDate(e.date)}</td>
          <td style={{ padding: "10px 12px" }}>{e.description}</td>
          <td style={{ padding: "10px 12px" }}><Badge text={e.category} bg="#FBEAE8" fg="#B3261E" /></td>
          <td style={{ padding: "10px 12px", fontWeight: 700 }}>{fmt(e.amount)}</td>
          <td style={{ padding: "10px 12px", textAlign: "right" }}><Trash2 size={14} style={{ cursor: "pointer", color: "#B3261E" }} onClick={() => remove(e.id)} /></td>
        </tr>)}</tbody>
      </table>
      {list.length === 0 && <div style={{ padding: 16, color: TEXT_MUTED, fontSize: 13 }}>Aucune dépense sur cette période.</div>}
    </Card>
    {modal && <ExpenseModal onClose={() => setModal(false)} run={run} />}
  </div>;
}

function ExpenseModal({ onClose, run }) {
  const accountId = useAccountId();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Autre");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!description || !amount) return;
    setSaving(true);
    try { await run(() => db.createExpense({ description, amount: +amount, category, date }, accountId)); onClose(); }
    finally { setSaving(false); }
  };
  return <Modal title="Ajouter une dépense" onClose={onClose}>
    <Field label="Description"><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Carburant camion" /></Field>
    <Field label="Catégorie"><input style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Transport, Entretien, Salaires" /></Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Montant (FCFA)"><input type="number" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Date"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </div>
    <Btn disabled={saving} onClick={save}>{saving ? "Enregistrement..." : "Enregistrer"}</Btn>
  </Modal>;
}

// ---------- Inventory ----------
function Inventory({ data, run, busy }) {
  const accountId = useAccountId();
  const [modal, setModal] = useState(null);
  const [checkDate, setCheckDate] = useState(todayISO());
  const availability = (item) => {
    const rented = data.reservations.filter((r) => r.status !== "Retourné" && checkDate >= r.startDate && checkDate <= r.endDate)
      .reduce((s, r) => s + (r.items.find((it) => it.itemId === item.id)?.qty || 0), 0);
    return item.total - rented;
  };
  const save = (item) => run(() => db.saveInventoryItem(item, accountId)).then(() => setModal(null));
  const remove = (id) => { if (confirm("Supprimer cet article ?")) run(() => db.deleteInventoryItem(id, accountId)); };

  return <div>
    <PageBanner icon={Package} title="Inventaire" subtitle="Articles, disponibilité et prix" />
    <SectionTitle action={<Btn icon={Plus} disabled={busy} onClick={() => setModal({})}>Ajouter un article</Btn>}>&nbsp;</SectionTitle>
    <div style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5B564C" }}>Vérifier disponibilité au :</span>
      <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} style={{ ...inputStyle, width: 160 }} />
    </div>
    <Card style={{ padding: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead><tr style={{ textAlign: "left", background: "#FAF9F5" }}>
          {["Article", "Catégorie", "Stock total", "Dispo (date choisie)", "Prix/jour", ""].map((h) => <th key={h} style={{ padding: "10px 12px", fontSize: 11.5, color: TEXT_MUTED, fontWeight: 700 }}>{h}</th>)}
        </tr></thead>
        <tbody>{data.inventory.map((i) => { const avail = availability(i); return <tr key={i.id} style={{ borderTop: "1px solid #F0EEE7" }}>
          <td style={{ padding: "10px 12px", fontWeight: 600 }}>{i.name}</td>
          <td style={{ padding: "10px 12px", color: "#5B564C" }}>{i.category}</td>
          <td style={{ padding: "10px 12px" }}>{i.total} {i.total <= i.low && <AlertTriangle size={13} color="#C9A227" style={{ marginLeft: 4, verticalAlign: -2 }} />}</td>
          <td style={{ padding: "10px 12px", fontWeight: 700, color: avail <= 0 ? "#B3261E" : "#1F6F4B" }}>{avail}</td>
          <td style={{ padding: "10px 12px" }}>{fmt(i.unit)}</td>
          <td style={{ padding: "10px 12px", textAlign: "right" }}>
            <Pencil size={14} style={{ cursor: "pointer", marginRight: 10, color: "#5B564C" }} onClick={() => setModal(i)} />
            <Trash2 size={14} style={{ cursor: "pointer", color: "#B3261E" }} onClick={() => remove(i.id)} />
          </td>
        </tr>; })}</tbody>
      </table>
    </Card>
    {modal !== null && <ItemModal item={modal} onClose={() => setModal(null)} onSave={save} />}
  </div>;
}
function ItemModal({ item, onClose, onSave }) {
  const [f, setF] = useState({ name: "", category: "", total: 0, unit: 0, low: 1, photo: null, ...item });
  const handlePhoto = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setF((s) => ({ ...s, photo: reader.result })); reader.readAsDataURL(file); };
  const handleNumber = (field) => (e) => { const v = e.target.value; setF((s) => ({ ...s, [field]: v === "" ? "" : v.replace(/^0+(?=\d)/, "") })); };
  const save = () => { onSave({ ...f, total: parseInt(f.total, 10) || 0, unit: parseInt(f.unit, 10) || 0, low: parseInt(f.low, 10) || 0 }); };
  return <Modal title={item.id ? "Modifier l'article" : "Nouvel article"} onClose={onClose}>
    <Field label="Nom"><input style={inputStyle} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    <Field label="Catégorie"><input style={inputStyle} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Quantité totale"><input type="number" style={inputStyle} value={f.total} onChange={handleNumber("total")} /></Field>
      <Field label="Prix unitaire / jour (FCFA)"><input type="number" style={inputStyle} value={f.unit} onChange={handleNumber("unit")} /></Field>
    </div>
    <Field label="Seuil d'alerte stock faible"><input type="number" style={inputStyle} value={f.low} onChange={handleNumber("low")} /></Field>
    <Field label="Photo">
      <input type="file" accept="image/*" onChange={handlePhoto} style={{ fontSize: 12.5 }} />
      {f.photo && <img src={f.photo} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, marginTop: 8 }} />}
    </Field>
    <Btn onClick={save}>Enregistrer</Btn>
  </Modal>;
}

// ---------- Reservations ----------
function Reservations({ data, run, busy }) {
  const accountId = useAccountId();
  const [modal, setModal] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("Tous");
  const list = data.reservations.filter((r) => filter === "Tous" || r.status === filter).slice().reverse();

  return <div>
    <PageBanner icon={CalendarDays} title="Réservations" subtitle="Commandes et suivi des paiements" />
    <SectionTitle action={<Btn icon={Plus} disabled={busy} onClick={() => setModal(true)}>Nouvelle commande (saisie manuelle)</Btn>}>&nbsp;</SectionTitle>
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      {["Tous", ...STATUS_FLOW].map((s) => <div key={s} onClick={() => setFilter(s)} style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: filter === s ? "#1F6F4B" : "#F1EFE8", color: filter === s ? "#fff" : "#5B564C" }}>{s}</div>)}
    </div>
    <div style={{ display: "grid", gap: 10 }}>
      {list.map((r) => {
        const total = reservationTotal(r);
        const paid = r.payments.reduce((s, p) => s + p.amount, 0);
        return <Card key={r.id}>
          <div onClick={() => setOpenId(r.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{r.clientName} <span style={{ fontWeight: 500, color: "#8A857A", fontSize: 12.5 }}>· {r.startDate} → {r.endDate}</span></div>
              <div style={{ fontSize: 12.5, color: "#5B564C", marginTop: 3 }}>{r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Badge text={r.status} bg={STATUS_COLORS[r.status].bg} fg={STATUS_COLORS[r.status].fg} />
              <div style={{ fontSize: 12.5, marginTop: 5, color: paid >= total ? "#1F6F4B" : "#B3261E", fontWeight: 700 }}>{fmt(paid)} / {fmt(total)} payé</div>
            </div>
          </div>
        </Card>;
      })}
      {list.length === 0 && <Card><div style={{ color: TEXT_MUTED, fontSize: 13.5 }}>Aucune commande dans ce filtre.</div></Card>}
    </div>
    {modal && <NewReservationModal data={data} run={run} onClose={() => setModal(false)} />}
    {openId && <ReservationDetail data={data} run={run} id={openId} onClose={() => setOpenId(null)} onEdit={(id) => { setOpenId(null); setEditId(id); }} />}
    {editId && <EditReservationModal data={data} run={run} reservation={data.reservations.find((r) => r.id === editId)} onClose={() => setEditId(null)} />}
  </div>;
}

function NewReservationModal({ data, run, onClose }) {
  const accountId = useAccountId();
  const [clientMode, setClientMode] = useState("existing");
  const [clientId, setClientId] = useState(data.clients[0]?.id || "");
  const [newClient, setNewClient] = useState({ name: "", phone: "" });
  const [selectedItems, setSelectedItems] = useState({});
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState(ZONES[0].id);
  const [seasonal, setSeasonal] = useState(false);
  const [deposit, setDeposit] = useState(0);
  const [depositMode, setDepositMode] = useState("Mobile Money");
  const [caution, setCaution] = useState(0);
  const [driverId, setDriverId] = useState("");
  const [freelance, setFreelance] = useState({ name: "", phone: "", fee: "" });
  const [saving, setSaving] = useState(false);

  const applyPack = (packId) => {
    const pack = data.packs.find((p) => p.id === packId); if (!pack) return;
    const next = { ...selectedItems }; pack.items.forEach((pi) => { next[pi.itemId] = (next[pi.itemId] || 0) + pi.qty; }); setSelectedItems(next);
  };

  const submit = async () => {
    setSaving(true);
    try {
      let cId = clientId;
      if (clientMode === "new") { if (!newClient.name) { setSaving(false); return; } cId = await db.createClient(newClient.name, newClient.phone, accountId); }
      let dId = driverId || null;
      if (driverId === "__new_freelance") { if (!freelance.name) { setSaving(false); return; } dId = await db.createDriver(freelance.name, freelance.phone, "externe", +freelance.fee || 0, accountId); }
      const items = Object.entries(selectedItems).filter(([, q]) => q > 0).map(([itemId, qty]) => { const inv = data.inventory.find((i) => i.id === itemId); return { itemId, qty, unit: inv.unit }; });
      if (items.length === 0 || !start || !end) { setSaving(false); return; }
      await run(() => db.createReservation({ clientId: cId, items, startDate: start, endDate: end, address, zone, seasonal, caution: +caution || 0, driverId: dId, deposit: +deposit || 0, depositMode }, accountId));
      onClose();
    } finally { setSaving(false); }
  };

  return <Modal title="Nouvelle commande — saisie manuelle" onClose={onClose} width={640}>
    <Field label="Client">
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Btn small variant={clientMode === "existing" ? "primary" : "ghost"} onClick={() => setClientMode("existing")}>Client existant</Btn>
        <Btn small variant={clientMode === "new" ? "primary" : "ghost"} onClick={() => setClientMode("new")}>Nouveau client</Btn>
      </div>
      {clientMode === "existing" ? <select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}>
        {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
      </select> : <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Nom" style={inputStyle} value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
        <input placeholder="Téléphone" style={inputStyle} value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
      </div>}
    </Field>
    <Field label="Packs prédéfinis (optionnel)"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{data.packs.map((p) => <Btn key={p.id} small variant="gold" onClick={() => applyPack(p.id)}>{p.name}</Btn>)}</div></Field>
    <Field label="Articles et quantités">
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, maxHeight: 160, overflowY: "auto" }}>
        {data.inventory.map((i) => <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid #F3F1EA" }}>
          <span style={{ fontSize: 13 }}>{i.name} <span style={{ color: "#8A857A" }}>({fmt(i.unit)}/j)</span></span>
          <input type="number" min="0" style={{ ...inputStyle, width: 70 }} value={selectedItems[i.id] || 0} onChange={(e) => setSelectedItems({ ...selectedItems, [i.id]: +e.target.value })} />
        </div>)}
      </div>
    </Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Date de début"><input type="date" style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="Date de fin"><input type="date" style={inputStyle} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
    </div>
    <Field label="Adresse de livraison"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Zone de livraison"><select style={inputStyle} value={zone} onChange={(e) => setZone(e.target.value)}>{ZONES.map((z) => <option key={z.id} value={z.id}>{z.label} (+{fmt(z.fee)})</option>)}</select></Field>
      <Field label="Tarification"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 8 }}><input type="checkbox" checked={seasonal} onChange={(e) => setSeasonal(e.target.checked)} /> Haute saison (+20%)</label></Field>
    </div>
    <Field label="Livreur">
      <select style={inputStyle} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
        <option value="">Non assigné</option>
        {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type === "externe" ? "freelance" : "interne"})</option>)}
        <option value="__new_freelance">+ Nouveau livreur freelance...</option>
      </select>
      {driverId === "__new_freelance" && <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input placeholder="Nom" style={inputStyle} value={freelance.name} onChange={(e) => setFreelance({ ...freelance, name: e.target.value })} />
        <input placeholder="Téléphone" style={inputStyle} value={freelance.phone} onChange={(e) => setFreelance({ ...freelance, phone: e.target.value })} />
        <input placeholder="Frais/course" type="number" style={inputStyle} value={freelance.fee} onChange={(e) => setFreelance({ ...freelance, fee: e.target.value })} />
      </div>}
    </Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      <Field label="Acompte reçu (FCFA)"><input type="number" style={inputStyle} value={deposit} onChange={(e) => setDeposit(e.target.value)} /></Field>
      <Field label="Mode de paiement acompte"><select style={inputStyle} value={depositMode} onChange={(e) => setDepositMode(e.target.value)}>{PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}</select></Field>
      <Field label="Caution (FCFA)"><input type="number" style={inputStyle} value={caution} onChange={(e) => setCaution(e.target.value)} /></Field>
    </div>
    <Btn disabled={saving} onClick={submit}>{saving ? "Enregistrement..." : "Créer la commande"}</Btn>
  </Modal>;
}

function EditReservationModal({ data, run, reservation, onClose }) {
  const accountId = useAccountId();
  const [selectedItems, setSelectedItems] = useState(() => { const obj = {}; reservation.items.forEach((it) => { obj[it.itemId] = it.qty; }); return obj; });
  const [start, setStart] = useState(reservation.startDate);
  const [end, setEnd] = useState(reservation.endDate);
  const [address, setAddress] = useState(reservation.address || "");
  const [zone, setZone] = useState(reservation.zone);
  const [seasonal, setSeasonal] = useState(reservation.seasonal);
  const [caution, setCaution] = useState(reservation.caution);
  const [driverId, setDriverId] = useState(reservation.driverId || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const items = Object.entries(selectedItems).filter(([, q]) => q > 0).map(([itemId, qty]) => { const inv = data.inventory.find((i) => i.id === itemId); return { itemId, qty, unit: inv ? inv.unit : 0 }; });
    if (items.length === 0 || !start || !end) return;
    setSaving(true);
    try {
      await run(async () => {
        await db.updateReservationInfo(reservation.id, { startDate: start, endDate: end, address, zone, seasonal, driverId: driverId || null, caution: +caution || 0 }, accountId);
        await db.updateReservationItems(reservation.id, items, accountId);
      });
      onClose();
    } finally { setSaving(false); }
  };

  return <Modal title={`Modifier la commande — ${reservation.clientName}`} onClose={onClose} width={640}>
    <Field label="Client"><div style={{ ...inputStyle, background: "#F1EFE8", color: "#5B564C" }}>{reservation.clientName}</div></Field>
    <Field label="Articles et quantités">
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, maxHeight: 160, overflowY: "auto" }}>
        {data.inventory.map((i) => <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid #F3F1EA" }}>
          <span style={{ fontSize: 13 }}>{i.name} <span style={{ color: "#8A857A" }}>({fmt(i.unit)}/j)</span></span>
          <input type="number" min="0" style={{ ...inputStyle, width: 70 }} value={selectedItems[i.id] || 0} onChange={(e) => setSelectedItems({ ...selectedItems, [i.id]: +e.target.value })} />
        </div>)}
      </div>
    </Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Date de début"><input type="date" style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="Date de fin"><input type="date" style={inputStyle} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
    </div>
    <Field label="Adresse de livraison"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Zone de livraison"><select style={inputStyle} value={zone} onChange={(e) => setZone(e.target.value)}>{ZONES.map((z) => <option key={z.id} value={z.id}>{z.label} (+{fmt(z.fee)})</option>)}</select></Field>
      <Field label="Tarification"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 8 }}><input type="checkbox" checked={seasonal} onChange={(e) => setSeasonal(e.target.checked)} /> Haute saison (+20%)</label></Field>
    </div>
    <Field label="Livreur">
      <select style={inputStyle} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
        <option value="">Non assigné</option>
        {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type === "externe" ? "freelance" : "interne"})</option>)}
      </select>
    </Field>
    <Field label="Caution (FCFA)"><input type="number" style={inputStyle} value={caution} onChange={(e) => setCaution(e.target.value)} /></Field>
    <Btn disabled={saving} onClick={submit}>{saving ? "Enregistrement..." : "Enregistrer les modifications"}</Btn>
  </Modal>;
}

function ReservationDetail({ data, run, id, onClose, onEdit }) {
  const accountId = useAccountId();
  const r = data.reservations.find((x) => x.id === id);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("Espèces");
  const [damaged, setDamaged] = useState({});
  if (!r) return null;
  const total = reservationTotal(r);
  const paid = r.payments.reduce((s, p) => s + p.amount, 0);
  const driver = data.drivers.find((d) => d.id === r.driverId);

  const addPayment = () => { if (!payAmount || +payAmount <= 0) return; run(() => db.addPayment(r.id, +payAmount, payMode, accountId)); setPayAmount(""); };
  const handlePhoto = (e, saveFn) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => run(() => saveFn(r.id, reader.result, accountId)); reader.readAsDataURL(file); };
  const confirmCheckIn = () => {
    const damagedByRiId = {};
    r.items.forEach((it) => { damagedByRiId[it.riId] = damaged[it.itemId] || 0; });
    const damagedTotal = Object.values(damagedByRiId).reduce((s, v) => s + (Number(v) || 0), 0) * 2000;
    run(() => db.closeCheckIn(r.id, damagedByRiId, r.caution - damagedTotal, accountId));
  };
  const handleDelete = () => {
    if (confirm("Supprimer définitivement cette commande ? Cette action est irréversible.")) {
      run(() => db.deleteReservation(r.id, accountId)).then(() => onClose());
    }
  };

  return <Modal title={`Commande — ${r.clientName}`} onClose={onClose} width={620}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STATUS_FLOW.map((s) => <Btn key={s} small variant={r.status === s ? "primary" : "ghost"} onClick={() => run(() => db.setStatus(r.id, s, accountId))}>{s}</Btn>)}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Pencil size={16} style={{ cursor: "pointer", color: "#5B564C" }} onClick={() => onEdit(r.id)} />
        <Trash2 size={16} style={{ cursor: "pointer", color: "#B3261E" }} onClick={handleDelete} />
      </div>
    </div>
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, marginBottom: 4 }}><b>Dates :</b> {r.startDate} → {r.endDate}</div>
      <div style={{ fontSize: 13, marginBottom: 4 }}><b>Adresse :</b> {r.address || "—"} ({ZONES.find((z) => z.id === r.zone)?.label})</div>
      <div style={{ fontSize: 13, marginBottom: 4 }}><b>Livreur :</b> {driver ? `${driver.name} (${driver.type === "externe" ? "freelance" : "interne"})` : "Non assigné"}</div>
      <div style={{ fontSize: 13 }}><b>Articles :</b> {r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
    </Card>
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <span>Paiement</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#1F6F4B", cursor: "pointer" }} onClick={() => generateQuotePDF(r, data)}>
          <FileDown size={15} /> Télécharger le devis PDF
        </span>
      </div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>Total : <b>{fmt(total)}</b> · Payé : <b style={{ color: paid >= total ? "#1F6F4B" : "#B3261E" }}>{fmt(paid)}</b> · Reste : <b>{fmt(Math.max(total - paid, 0))}</b></div>
      {r.payments.map((p) => <div key={p.id} style={{ fontSize: 12.5, color: "#5B564C" }}>• {fmt(p.amount)} — {p.mode} — {p.date}</div>)}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input type="number" placeholder="Montant" style={{ ...inputStyle, width: 120 }} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
        <select style={inputStyle} value={payMode} onChange={(e) => setPayMode(e.target.value)}>{PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}</select>
        <Btn small icon={Wallet} onClick={addPayment}>Enregistrer</Btn>
      </div>
      <div style={{ fontSize: 12.5, color: "#8A857A", marginTop: 6 }}>Caution : {fmt(r.caution)}{r.cautionReturned != null && ` · restituée après casse : ${fmt(r.cautionReturned)}`}</div>
    </Card>
    {r.status === "Confirmé" && <Card style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>État des lieux — sortie (avant livraison)</div>
      <input type="file" accept="image/*" onChange={(e) => handlePhoto(e, db.saveCheckoutPhoto)} style={{ fontSize: 12.5 }} />
      {r.checkOut && <img src={r.checkOut} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, marginTop: 8 }} />}
      <div style={{ marginTop: 8 }}><Btn small icon={PackageCheck} onClick={() => run(() => db.setStatus(r.id, "Livré", accountId))}>Confirmer la livraison</Btn></div>
    </Card>}
    {r.status === "Livré" && <Card style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>État des lieux — retour</div>
      <input type="file" accept="image/*" onChange={(e) => handlePhoto(e, db.saveCheckinPhoto)} style={{ fontSize: 12.5, marginBottom: 8 }} />
      {r.checkIn && <img src={r.checkIn} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, marginBottom: 8 }} />}
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Quantité endommagée / perdue par article :</div>
      {r.items.map((it) => <div key={it.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>{it.name}</span>
        <input type="number" min="0" max={it.qty} style={{ ...inputStyle, width: 70 }} value={damaged[it.itemId] || 0} onChange={(e) => setDamaged({ ...damaged, [it.itemId]: e.target.value })} />
      </div>)}
      <Btn small variant="danger" icon={ShieldAlert} onClick={confirmCheckIn}>Clôturer et calculer la retenue sur caution</Btn>
    </Card>}
  </Modal>;
}

// ---------- Planning ----------
function Planning({ data }) {
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10); });
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const shift = (n) => { const d = new Date(start); d.setDate(d.getDate() + n * 7); setStart(d.toISOString().slice(0, 10)); };
  const bookedQty = (itemId, day) => data.reservations.filter((r) => r.status !== "Retourné" && day >= r.startDate && day <= r.endDate).reduce((s, r) => s + (r.items.find((i) => i.itemId === itemId)?.qty || 0), 0);

  return <div>
    <PageBanner icon={CalendarDays} title="Planning" subtitle={`Semaine du ${days[0]}`} />
    <div style={{ display: "flex", gap: 6, marginBottom: 12, justifyContent: "flex-end" }}>
      <Btn small variant="ghost" icon={ChevronLeft} onClick={() => shift(-1)}>Semaine préc.</Btn>
      <Btn small variant="ghost" onClick={() => shift(1)}>Semaine suiv. <ChevronRight size={13} /></Btn>
    </div>
    <Card style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr style={{ background: "#FAF9F5" }}><th style={{ padding: 8, textAlign: "left", fontSize: 11.5, color: TEXT_MUTED }}>Article</th>{days.map((d) => <th key={d} style={{ padding: 8, fontSize: 11, color: TEXT_MUTED }}>{d.slice(5)}</th>)}</tr></thead>
        <tbody>{data.inventory.map((item) => <tr key={item.id} style={{ borderTop: "1px solid #F0EEE7" }}>
          <td style={{ padding: 8, fontWeight: 700 }}>{item.name}</td>
          {days.map((d) => { const q = bookedQty(item.id, d); const ratio = q / item.total; const bg = q === 0 ? "#fff" : ratio >= 1 ? "#F7C9C4" : ratio > 0.6 ? "#FBE3B0" : "#DFF0E8"; return <td key={d} style={{ padding: 8, textAlign: "center", background: bg, fontWeight: q > 0 ? 700 : 400 }}>{q > 0 ? `${q}/${item.total}` : "—"}</td>; })}
        </tr>)}</tbody>
      </table>
    </Card>
    <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginTop: 8 }}>Vert = disponibilité confortable · Orange = tension &gt;60% · Rouge = complet</div>
  </div>;
}

// ---------- Clients ----------
function Clients({ data, run }) {
  const accountId = useAccountId();
  const [modal, setModal] = useState(null);
  const historyFor = (clientId) => data.reservations.filter((r) => r.clientId === clientId);
  const remove = (c, hist) => {
    if (hist.length > 0) { alert("Impossible de supprimer ce client : il a des réservations associées. Supprime d'abord ses réservations."); return; }
    if (confirm(`Supprimer le client ${c.name} ?`)) run(() => db.deleteClient(c.id, accountId));
  };
  return <div>
    <PageBanner icon={Users} title="Clients" subtitle="Historique et vigilance" />
    <div style={{ display: "grid", gap: 10 }}>
      {data.clients.map((c) => {
        const hist = historyFor(c.id);
        const spent = hist.reduce((s, r) => s + r.payments.reduce((s2, p) => s2 + p.amount, 0), 0);
        const damages = hist.filter((r) => (r.damaged || []).some((d) => d.qty > 0)).length;
        return <Card key={c.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800 }}>{c.name} {c.flagged && <Badge text="À surveiller" bg="#FBEAE8" fg="#B3261E" />}</div>
              <div style={{ fontSize: 12.5, color: "#8A857A", display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {c.phone}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5 }}><div>Total payé : <b>{fmt(spent)}</b></div><div>{hist.length} commande(s) · {damages} avec casse</div></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Btn small variant={c.flagged ? "danger" : "ghost"} onClick={() => run(() => db.setClientFlag(c.id, !c.flagged, accountId))}>{c.flagged ? "Retirer vigilance" : "Mettre en vigilance"}</Btn>
              <Pencil size={15} style={{ cursor: "pointer", color: "#5B564C" }} onClick={() => setModal(c)} />
              <Trash2 size={15} style={{ cursor: "pointer", color: "#B3261E" }} onClick={() => remove(c, hist)} />
            </div>
          </div>
        </Card>;
      })}
    </div>
    {modal && <ClientModal client={modal} onClose={() => setModal(null)} run={run} />}
  </div>;
}
function ClientModal({ client, onClose, run }) {
  const accountId = useAccountId();
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name) return;
    setSaving(true);
    try { await run(() => db.updateClient(client.id, name, phone, accountId)); onClose(); } finally { setSaving(false); }
  };
  return <Modal title="Modifier le client" onClose={onClose}>
    <Field label="Nom"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></Field>
    <Field label="Téléphone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
    <Btn disabled={saving} onClick={save}>{saving ? "Enregistrement..." : "Enregistrer"}</Btn>
  </Modal>;
}

// ---------- Drivers ----------
function Drivers({ data, run }) {
  const accountId = useAccountId();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const assignedCount = (driverId) => data.reservations.filter((r) => r.driverId === driverId).length;
  const remove = (d) => {
    if (assignedCount(d.id) > 0) { alert("Ce livreur est assigné à des réservations. Il sera désassigné automatiquement."); }
    if (confirm(`Supprimer le livreur ${d.name} ?`)) run(() => db.deleteDriver(d.id, accountId));
  };
  return <div>
    <PageBanner icon={Truck} title="Livreurs" subtitle="Internes et freelances" />
    <SectionTitle action={<Btn icon={Plus} onClick={() => setModal(true)}>Ajouter un livreur</Btn>}>&nbsp;</SectionTitle>
    <div style={{ display: "grid", gap: 10 }}>
      {data.drivers.map((d) => <Card key={d.id}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div><div style={{ fontWeight: 800 }}>{d.name}</div><div style={{ fontSize: 12.5, color: "#8A857A", display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {d.phone}</div></div>
          <Badge text={d.type === "externe" ? "Freelance / externe" : "Interne"} bg={d.type === "externe" ? "#FBF0DA" : "#DCEAFB"} fg={d.type === "externe" ? "#9A6A00" : "#1D5FA8"} />
          {d.type === "externe" && <div style={{ fontSize: 12.5 }}>Frais/course : {fmt(d.fee)}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Pencil size={15} style={{ cursor: "pointer", color: "#5B564C" }} onClick={() => setEditing(d)} />
            <Trash2 size={15} style={{ cursor: "pointer", color: "#B3261E" }} onClick={() => remove(d)} />
          </div>
        </div>
      </Card>)}
    </div>
    {modal && <DriverFormModal title="Nouveau livreur" driver={null} onClose={() => setModal(false)} run={run} />}
    {editing && <DriverFormModal title="Modifier le livreur" driver={editing} onClose={() => setEditing(null)} run={run} />}
  </div>;
}
function DriverFormModal({ title, driver, onClose, run }) {
  const accountId = useAccountId();
  const [f, setF] = useState({ name: driver?.name || "", phone: driver?.phone || "", type: driver?.type || "interne", fee: driver?.fee || 0 });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.name) return;
    setSaving(true);
    try {
      if (driver) await run(() => db.updateDriver(driver.id, f.name, f.phone, f.type, +f.fee || 0, accountId));
      else await run(() => db.createDriver(f.name, f.phone, f.type, +f.fee || 0, accountId));
      onClose();
    } finally { setSaving(false); }
  };
  return <Modal title={title} onClose={onClose}>
    <Field label="Nom"><input style={inputStyle} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    <Field label="Téléphone"><input style={inputStyle} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
    <Field label="Type"><select style={inputStyle} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="interne">Interne (salarié)</option><option value="externe">Freelance / externe</option></select></Field>
    {f.type === "externe" && <Field label="Frais par course (FCFA)"><input type="number" style={inputStyle} value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>}
    <Btn disabled={saving} onClick={save}>{saving ? "Enregistrement..." : "Enregistrer"}</Btn>
  </Modal>;
}

// ---------- Settings ----------
function SettingsPage({ data, run, busy }) {
  const accountId = useAccountId();
  const [f, setF] = useState({ ...data.settings });
  const [saved, setSaved] = useState(false);
  const handleLogo = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setF((s) => ({ ...s, logo: reader.result }));
    reader.readAsDataURL(file);
  };
  const save = () => { setSaved(false); run(() => db.saveSettings(f, accountId)).then(() => setSaved(true)); };
  return <div>
    <PageBanner icon={SettingsIcon} title="Paramètres" subtitle="Personnalisation du devis" />
    <Card style={{ maxWidth: 480 }}>
      <Field label="Nom de l'entreprise (en-tête du devis)"><input style={inputStyle} value={f.companyName} onChange={(e) => { setF({ ...f, companyName: e.target.value }); setSaved(false); }} /></Field>
      <Field label="Téléphone / contact (affiché sous le nom)"><input style={inputStyle} placeholder="Ex: +225 07 00 00 00 00" value={f.phone} onChange={(e) => { setF({ ...f, phone: e.target.value }); setSaved(false); }} /></Field>
      <Field label="Mention en pied de page"><input style={inputStyle} value={f.footerText} onChange={(e) => { setF({ ...f, footerText: e.target.value }); setSaved(false); }} /></Field>
      <Field label="Logo (affiché en haut à gauche du devis)">
        <input type="file" accept="image/*" onChange={handleLogo} style={{ fontSize: 12.5 }} />
        {f.logo && <div style={{ marginTop: 10 }}>
          <img src={f.logo} alt="Logo" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", padding: 4 }} />
          <div style={{ marginTop: 6 }}><Btn small variant="ghost" onClick={() => { setF({ ...f, logo: null }); setSaved(false); }}>Retirer le logo</Btn></div>
        </div>}
      </Field>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <Btn disabled={busy} onClick={save}>{busy ? "Enregistrement..." : "Enregistrer"}</Btn>
        {saved && <span style={{ fontSize: 12.5, color: "#1F6F4B", fontWeight: 700 }}>✓ Enregistré</span>}
      </div>
    </Card>
  </div>;
}

// ---------- Équipe ----------
function TeamPage({ data, run, profile }) {
  const accountId = useAccountId();
  const [modal, setModal] = useState(null);
  const [inviteModal, setInviteModal] = useState(false);
  const [invites, setInvites] = useState(null);
  const [busy, setBusy] = useState(false);

  const refreshInvites = useCallback(() => {
    db.fetchInvites(accountId).then(setInvites);
  }, [accountId]);
  useEffect(() => { refreshInvites(); }, [refreshInvites]);

  const removeInvite = (id) => {
    setBusy(true);
    db.deleteInvite(id, accountId).then(refreshInvites).finally(() => setBusy(false));
  };

  return <div>
    <PageBanner icon={UserCog} title="Équipe" subtitle="Membres et droits d'accès de ton entreprise" />
    <SectionTitle action={<Btn icon={Plus} onClick={() => setInviteModal(true)}>Inviter un membre</Btn>}>&nbsp;</SectionTitle>

    <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
      {data.users.map((u) => <Card key={u.id}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800 }}>{u.name} {u.id === profile.id && <Badge text="Toi" bg="#DCEAFB" fg="#1D5FA8" />}</div>
            <div style={{ fontSize: 11.5, color: "#8A857A", marginTop: 4 }}>
              Accès : {MODULES.filter((m) => u.permissions?.[m.id]).map((m) => m.label).join(", ") || "Aucun"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Pencil size={15} style={{ cursor: "pointer", color: "#5B564C" }} onClick={() => setModal(u)} />
            {u.id !== profile.id && <Trash2 size={15} style={{ cursor: "pointer", color: "#B3261E" }} onClick={() => {
              if (confirm(`Retirer ${u.name} de l'équipe ? Cette personne perdra immédiatement l'accès à l'application.`)) {
                run(() => db.deleteTeamMember(u.id, accountId));
              }
            }} />}
          </div>
        </div>
      </Card>)}
    </div>

    <div style={{ fontWeight: 800, marginBottom: 10 }}>Invitations en attente</div>
    <div style={{ display: "grid", gap: 8 }}>
      {invites === null && <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>Chargement...</div>}
      {invites?.filter((i) => !i.used).map((i) => <Card key={i.id}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 2 }}>{i.code}</div>
            <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginTop: 2 }}>
              Accès prévu : {MODULES.filter((m) => i.permissions?.[m.id]).map((m) => m.label).join(", ") || "Aucun"}
            </div>
          </div>
          <Trash2 size={15} style={{ cursor: "pointer", color: "#B3261E" }} onClick={() => removeInvite(i.id)} />
        </div>
      </Card>)}
      {invites?.filter((i) => !i.used).length === 0 && <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>Aucune invitation en attente.</div>}
    </div>

    {modal && <TeamMemberModal member={modal} onClose={() => setModal(null)} run={run} />}
    {inviteModal && <InviteModal onClose={() => setInviteModal(false)} onCreated={refreshInvites} />}
  </div>;
}

function InviteModal({ onClose, onCreated }) {
  const accountId = useAccountId();
  const defaultPerms = { dashboard: false, bilan: false, revenues: false, expenses: false, inventory: true, reservations: true, planning: true, clients: true, drivers: true, settings: false, users: false };
  const [permissions, setPermissions] = useState(defaultPerms);
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState(null);
  const togglePerm = (id) => setPermissions((p) => ({ ...p, [id]: !p[id] }));

  const generate = async () => {
    setSaving(true);
    try {
      const invite = await db.createInvite(accountId, permissions);
      setGenerated(invite.code);
      onCreated();
    } finally { setSaving(false); }
  };

  if (generated) {
    return <Modal title="Invitation créée" onClose={onClose}>
      <div style={{ textAlign: "center", padding: "10px 0" }}>
        <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginBottom: 10 }}>Partage ce code à la personne que tu invites :</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 6, background: "#F1F2F6", borderRadius: 10, padding: "16px 0", marginBottom: 14 }}>{generated}</div>
        <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 16 }}>Valable 7 jours. Elle devra aller sur l'écran de connexion → "Rejoindre une entreprise" et saisir ce code.</div>
        <Btn onClick={onClose}>Terminé</Btn>
      </div>
    </Modal>;
  }

  return <Modal title="Inviter un membre" onClose={onClose}>
    <Field label="Modules accessibles pour cette personne">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {MODULES.map((m) => (
          <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={!!permissions[m.id]} onChange={() => togglePerm(m.id)} /> {m.label}
          </label>
        ))}
      </div>
    </Field>
    <Btn disabled={saving} onClick={generate}>{saving ? "Génération..." : "Générer le code d'invitation"}</Btn>
  </Modal>;
}

function TeamMemberModal({ member, onClose, run }) {
  const accountId = useAccountId();
  const [name, setName] = useState(member.name);
  const [permissions, setPermissions] = useState({ ...member.permissions });
  const [saving, setSaving] = useState(false);
  const togglePerm = (id) => setPermissions((p) => ({ ...p, [id]: !p[id] }));
  const save = async () => {
    setSaving(true);
    try {
      await run(async () => {
        await db.updateTeamMemberName(member.id, name, accountId);
        await db.updateTeamMemberPermissions(member.id, permissions, accountId);
      });
      onClose();
    } finally { setSaving(false); }
  };
  return <Modal title="Modifier le membre" onClose={onClose}>
    <Field label="Nom complet"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></Field>
    <Field label="Modules accessibles">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {MODULES.map((m) => (
          <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={!!permissions[m.id]} onChange={() => togglePerm(m.id)} /> {m.label}
          </label>
        ))}
      </div>
    </Field>
    <Btn disabled={saving} onClick={save}>{saving ? "Enregistrement..." : "Enregistrer"}</Btn>
  </Modal>;
}

// ============================================================
// Application "super-admin plateforme"
// ============================================================
function PlatformAdminApp({ profile, onLogout }) {
  const [view, setView] = useState("accounts");
  const [accounts, setAccounts] = useState(null);
  const [users, setUsers] = useState(null);
  const [platformSettings, setPlatformSettings] = useState(null);
  const [contactPhone, setContactPhone] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setAccounts(await db.fetchAllAccounts()); setError(null); }
    catch (e) { console.error(e); setError(e.message); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    db.fetchPlatformSettings().then((s) => { setPlatformSettings(s); setContactPhone(s.contactPhone); });
  }, []);
  useEffect(() => {
    if (view === "users" && users === null) {
      db.fetchAllUsers().then(setUsers).catch((e) => { console.error(e); setError(e.message); });
    }
  }, [view, users]);

  const saveContactPhone = async () => {
    setSavingSettings(true); setSettingsSaved(false);
    try {
      await db.savePlatformSettings({ id: platformSettings?.id, contactPhone });
      setPlatformSettings((s) => ({ ...s, contactPhone }));
      setSettingsSaved(true);
    } catch (e) { console.error(e); setError(e.message); }
    finally { setSavingSettings(false); }
  };

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { console.error(e); setError(e.message); }
    finally { setBusy(false); }
  };

  const daysLeft = (trialEnd) => {
    const diff = Math.ceil((new Date(trialEnd) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };
  const statusBadge = (status) => {
    const map = { trial: { bg: "#FBF0DA", fg: "#9A6A00", label: "Essai" }, active: { bg: "#DFF0E8", fg: "#1F6F4B", label: "Actif" }, expired: { bg: "#FBEAE8", fg: "#B3261E", label: "Expiré" }, cancelled: { bg: "#EAE8E2", fg: "#5B564C", label: "Résilié" } };
    const s = map[status] || map.trial;
    return <Badge text={s.label} bg={s.bg} fg={s.fg} />;
  };

  const activate = (accountId) => run(() => db.updateAccountStatus(accountId, { status: "active" }));
  const extendTrial = (accountId) => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    run(() => db.updateAccountStatus(accountId, { status: "trial", trialEnd: d.toISOString().slice(0, 10) }));
  };
  const cancel = (accountId) => { if (confirm("Résilier ce compte ?")) run(() => db.updateAccountStatus(accountId, { status: "cancelled" })); };
  const remove = (account) => {
    const typed = prompt(`Suppression définitive et irréversible.\nToutes les données de "${account.companyName}" seront perdues.\n\nPour confirmer, retape exactement le nom de l'entreprise :`);
    if (typed === null) return;
    if (typed.trim() !== account.companyName) { alert("Le nom saisi ne correspond pas. Suppression annulée."); return; }
    run(() => db.deleteAccount(account.id));
  };

  return <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif", background: BG, minHeight: "100vh", color: TEXT_DARK }}>
    <style>{`* { box-sizing: border-box; } button { font-family: inherit; cursor: pointer; }`}</style>
    <div style={{ background: NAVY, color: "#fff", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ShieldCheck size={22} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Super-admin — Plateforme EventRent CI</div>
          <div style={{ fontSize: 11.5, color: "#9BAFC9" }}>{profile.name}</div>
        </div>
      </div>
      <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <LogOut size={13} /> Déconnexion
      </button>
    </div>
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      {error && <div style={{ background: "#FBEAE8", color: "#B3261E", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13.5 }}>⚠ {error}</div>}
      <Card style={{ marginBottom: 20, maxWidth: 400 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Contact affiché aux essais expirés</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={inputStyle} value={contactPhone} onChange={(e) => { setContactPhone(e.target.value); setSettingsSaved(false); }} placeholder="Ex: +225 07 00 00 00 00" />
          <Btn small disabled={savingSettings} onClick={saveContactPhone}>{savingSettings ? "..." : "Enregistrer"}</Btn>
        </div>
        {settingsSaved && <div style={{ fontSize: 12, color: "#1F6F4B", fontWeight: 700, marginTop: 6 }}>✓ Enregistré</div>}
      </Card>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Btn small variant={view === "accounts" ? "primary" : "ghost"} onClick={() => setView("accounts")}>Comptes clients</Btn>
        <Btn small variant={view === "users" ? "primary" : "ghost"} onClick={() => setView("users")}>Utilisateurs</Btn>
      </div>

      {view === "accounts" && <>
        <SectionTitle>Comptes clients ({accounts?.length || 0})</SectionTitle>
        {!accounts ? <FullScreenLoader /> : <div style={{ display: "grid", gap: 10 }}>
          {accounts.map((a) => <Card key={a.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>{a.companyName} {statusBadge(a.status)}</div>
                <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 3 }}>
                  Inscrit le {fmtDate(a.createdAt)} · Plan {a.plan}
                  {a.status === "trial" && ` · ${daysLeft(a.trialEnd)} jour(s) d'essai restant(s)`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {a.status !== "active" && <Btn small disabled={busy} onClick={() => activate(a.id)}>Activer</Btn>}
                {a.status === "trial" && <Btn small variant="ghost" disabled={busy} onClick={() => extendTrial(a.id)}>Prolonger l'essai</Btn>}
                {a.status !== "cancelled" && <Btn small variant="danger" disabled={busy} onClick={() => cancel(a.id)}>Résilier</Btn>}
                {a.id !== "11111111-1111-1111-1111-111111111111" && <Btn small variant="danger" disabled={busy} onClick={() => remove(a)}>Supprimer</Btn>}
              </div>
            </div>
          </Card>)}
          {accounts.length === 0 && <Card><div style={{ color: TEXT_MUTED, fontSize: 13.5 }}>Aucun compte client pour l'instant.</div></Card>}
        </div>}
      </>}

      {view === "users" && <>
        <SectionTitle>Utilisateurs ({users?.length || 0})</SectionTitle>
        {!users ? <FullScreenLoader /> : <Card style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", background: "#FAF9F5" }}>
              {["Nom", "Email", "Entreprise", "Statut", "Rôle", "Inscrit le"].map((h) => <th key={h} style={{ padding: "10px 12px", fontSize: 11, color: TEXT_MUTED, fontWeight: 700 }}>{h}</th>)}
            </tr></thead>
            <tbody>{users.map((u) => <tr key={u.id} style={{ borderTop: "1px solid #F0EEE7" }}>
              <td style={{ padding: "10px 12px", fontWeight: 700 }}>{u.name}</td>
              <td style={{ padding: "10px 12px" }}>{u.email}</td>
              <td style={{ padding: "10px 12px" }}>{u.companyName}</td>
              <td style={{ padding: "10px 12px" }}>{u.isPlatformAdmin ? <Badge text="—" bg="#EAE8E2" fg="#5B564C" /> : statusBadge(u.accountStatus)}</td>
              <td style={{ padding: "10px 12px" }}>{u.isPlatformAdmin ? <Badge text="Super-admin" bg="#DCEAFB" fg="#1D5FA8" /> : <Badge text={u.permissions?.users ? "Admin entreprise" : "Membre"} bg="#F1EFE8" fg="#5B564C" />}</td>
              <td style={{ padding: "10px 12px", color: TEXT_MUTED }}>{fmtDate(u.createdAt)}</td>
            </tr>)}</tbody>
          </table>
          {users.length === 0 && <div style={{ padding: 16, color: TEXT_MUTED, fontSize: 13.5 }}>Aucun utilisateur pour l'instant.</div>}
        </Card>}
      </>}
    </div>
  </div>;
}
