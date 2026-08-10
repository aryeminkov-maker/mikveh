import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { storage } from "./storage";
import { signInWithGoogle, signOutUser, subscribeAuth, ensureAnonymousAuth } from "./auth";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";
import {
  Droplets, Lock, Unlock, Users, Wallet, Package, StickyNote, Wrench,
  AlertTriangle, Mic, Plus, Minus, ChevronRight, LogOut, Check, X,
  ClipboardList, LineChart as LineChartIcon, FileSpreadsheet, History,
  PhoneCall, Clock, MapPin, Accessibility, CalendarCheck, ShieldAlert,
  Thermometer, TrendingUp, Download, RefreshCw, Building2, ShieldCheck,
  Link2, Copy, Tablet, Smartphone, Settings, Trash2, KeyRound, Loader2, Navigation,
  Bell, Info, Bath, Timer, Gift, Clock3,
  Image, ImagePlus, ArrowRight, MessageSquare
} from "lucide-react";

/* ============================================================
   DESIGN TOKENS (see inline comments) — teal/seafoam civic palette
   grounded in water + tradition, avoiding cliché AI defaults.
   ============================================================ */
const COLORS = {
  ink: "#0B3A52",
  teal: "#12628A",
  aqua: "#33A9CE",
  aquaLight: "#DCF1F9",
  seafoam: "#EEF7FB",
  gold: "#C79A3E",
  goldLight: "#F6EBD2",
  red: "#B3463A",
  redLight: "#F8E4E1",
  paper: "#FBFDFE",
};

const WEEKDAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }); }
function fmtDate(d) { const dt = new Date(d); return dt.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function fmtDateTime(iso) { const dt = new Date(iso); return `${dt.toLocaleDateString("he-IL")} ${dt.toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"})}`; }
function weekdayOf(dateStr) { return WEEKDAYS_HE[new Date(dateStr).getDay()]; }
function fmtILS(n) { return `₪${Number(n || 0).toLocaleString("he-IL")}`; }
function uid() { return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }

/* ============================================================
   URL normalization — converts share links to direct image URLs.
   Handles Google Drive (both /file/d/ and /open?id= formats),
   Dropbox, and passes everything else through unchanged.
   ============================================================ */
function toDirectImageUrl(url) {
  if (!url || !url.trim()) return url;
  const s = url.trim();

  // Google Drive: https://drive.google.com/file/d/FILE_ID/view?...
  const driveFile = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFile) return `https://drive.google.com/uc?export=view&id=${driveFile[1]}`;

  // Google Drive: https://drive.google.com/open?id=FILE_ID
  const driveOpen = s.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (driveOpen) return `https://drive.google.com/uc?export=view&id=${driveOpen[1]}`;

  // Google Drive: already in uc?export format — pass through
  if (s.includes('drive.google.com/uc')) return s;

  // Imgur share page: https://imgur.com/XXXXX → https://i.imgur.com/XXXXX.jpeg
  const imgurPage = s.match(/^https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]+)\s*$/);
  if (imgurPage) return `https://i.imgur.com/${imgurPage[1]}.jpeg`;

  // Dropbox: change dl=0 → raw=1 for direct display
  if (s.includes('dropbox.com')) return s.replace('dl=0', 'raw=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');

  return s;
}

/* ============================================================
   PERSISTENCE — all data is shared: every viewer of this artifact
   (kiosk / admin / public) reads and writes the same records, which
   is what lets the three roles work together as one live system.
   ============================================================ */
function useShared(key, initial) {
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await storage.get(key);
        if (active && res !== null && res !== undefined) setValue(res);
      } catch (e) {
        /* key not found yet — keep initial value */
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const persist = useCallback(async (updater) => {
    setValue((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      storage.set(key, next).catch(() => setError(true));
      return next;
    });
  }, [key]);

  return [value, persist, loaded, error];
}

const DEFAULT_STAFF = [
  { id: "s1", name: "רחל כהן", pin: "1234", phone: "", email: "" },
  { id: "s2", name: "מירי לוי", pin: "2580", phone: "", email: "" },
  { id: "s3", name: "שרה אזולאי", pin: "9911", phone: "", email: "" },
];

const DEFAULT_INVENTORY = {
  chlorine: { label: "כלור", qty: 8, threshold: 3, unit: "מיכלים" },
  cleaning: { label: "חומרי ניקוי", qty: 12, threshold: 4, unit: 'יח' },
  towels: { label: "מגבות", qty: 40, threshold: 15, unit: "יח'" },
  kits: { label: "ערכות בלנית", qty: 20, threshold: 5, unit: "יח'" },
};

const OPENING_HOURS = [
  { day: "ראשון", hours: "20:00–23:30" },
  { day: "שני", hours: "20:00–23:30" },
  { day: "שלישי", hours: "20:00–23:30" },
  { day: "רביעי", hours: "20:00–23:30" },
  { day: "חמישי", hours: "20:00–00:30" },
  { day: "שישי", hours: "סגור" },
  { day: "שבת", hours: "צאת השבת–00:00" },
];

const DEFAULT_MIKVEHS = [
  { id: "m1", name: "מקווה מרכזי", address: "רח' הרצל 12", phone: "", notes: "", accessible: true, amenities: ["חדרי הכנה מרווחים", "ערכות בלנית וחומרי טיפוח למכירה", "חניה נגישה בסמוך לכניסה"], bookingEnabled: false, photoUrl: "", photos: [], pinnedNote: "", roomsCount: 3, bathRooms: 2, showerRooms: 1, price: "25", paymentUrl: "", manualLoad: null, feedbackUrl: "", hours: OPENING_HOURS.map((d) => ({ ...d })), setupToken: uid() },
];

/* ============================================================
   AUTH — thin React hook around the Google sign-in in auth.js
   ============================================================ */
function useAuthUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = subscribeAuth((u) => { setUser(u); setLoading(false); });
    return unsub;
  }, []);
  return [user, loading];
}

// Runs once at app start: if nobody is signed in yet, falls back to an
// anonymous session so public visitors and installed kiosk tablets (neither
// of which use Google sign-in) can still read/write under firestore.rules.
function useEnsureBaselineAuth() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const unsub = subscribeAuth((u) => {
      if (u) { if (!cancelled) setReady(true); return; }
      ensureAnonymousAuth().catch(() => { if (!cancelled) setReady(true); });
      // if anonymous sign-in succeeds, onAuthStateChanged fires again with a user
    });
    return () => { cancelled = true; unsub(); };
  }, []);
  return ready;
}

/* ============================================================
   MIKVEHS — the list of physical mikvehs this council runs.
   Stored under one shared key (not mikveh-specific).
   ============================================================ */
function useMikvehs() {
  const [list, setList] = useShared("mikvehs", DEFAULT_MIKVEHS);

  const addMikveh = useCallback((name, address) => {
    setList((prev) => [...prev, { id: uid(), name, address, phone: "", notes: "", accessible: true, amenities: ["חדרי הכנה מרווחים", "ערכות בלנית וחומרי טיפוח למכירה", "חניה נגישה בסמוך לכניסה"], bookingEnabled: false, photoUrl: "", photos: [], pinnedNote: "", roomsCount: 3, bathRooms: 2, showerRooms: 1, price: "25", paymentUrl: "", manualLoad: null, feedbackUrl: "", hours: OPENING_HOURS.map((d) => ({ ...d })), setupToken: uid() }]);
  }, [setList]);

  const updateMikveh = useCallback((id, patch) => {
    setList((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
  }, [setList]);

  const removeMikveh = useCallback((id) => {
    setList((prev) => prev.filter((m) => m.id !== id));
  }, [setList]);

  const regenerateToken = useCallback((id) => {
    setList((prev) => prev.map((m) => m.id === id ? { ...m, setupToken: uid() } : m));
  }, [setList]);

  return { list, addMikveh, updateMikveh, removeMikveh, regenerateToken };
}

const DEVICE_KEY = "mikveh-kiosk-device-id";
function pairedMikvehId() {
  try { return localStorage.getItem(DEVICE_KEY) || ""; } catch (e) { return ""; }
}
function pairDevice(mikvehId) {
  try { localStorage.setItem(DEVICE_KEY, mikvehId); } catch (e) { /* ignore */ }
}
function unpairDevice() {
  try { localStorage.removeItem(DEVICE_KEY); } catch (e) { /* ignore */ }
}


function useHashRoute() {
  const parse = () => window.location.hash.replace(/^#\/?/, "") || "public";
  const [route, setRoute] = useState(parse());
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = (r) => { window.location.hash = "/" + r; };
  return [route, navigate];
}

export default function MikvehSystem() {
  const [route, navigate] = useHashRoute();
  const authReady = useEnsureBaselineAuth();
  const mikvehs = useMikvehs();

  if (!authReady) {
    return (
      <div dir="rtl" style={{ background: COLORS.seafoam, minHeight: "100%", width: "100%", overflowX: "hidden", fontFamily: "'Assistant', sans-serif", color: COLORS.ink, boxSizing: "border-box" }}>
        <FontLoader />
        <CenteredLoading text="טוענת…" />
      </div>
    );
  }

  // one-time tablet pairing link: #/kiosk-setup/{mikvehId}/{token}
  if (route.startsWith("kiosk-setup/")) {
    return (
      <div dir="rtl" style={{ background: COLORS.seafoam, minHeight: "100%", width: "100%", overflowX: "hidden", fontFamily: "'Assistant', sans-serif", color: COLORS.ink, boxSizing: "border-box" }}>
        <FontLoader />
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 16px 48px" }}>
          <KioskSetupHandler route={route} mikvehs={mikvehs} navigate={navigate} />
        </div>
      </div>
    );
  }

  const topRoute = route === "public" ? "public" : route === "admin" ? "admin" : "kiosk";

  return (
    <div dir="rtl" style={{ background: COLORS.seafoam, minHeight: "100%", width: "100%", overflowX: "hidden", fontFamily: "'Assistant', sans-serif", color: COLORS.ink, boxSizing: "border-box" }}>
      <FontLoader />
      <TopBar route={topRoute} navigate={navigate} />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 16px 48px" }}>
        {topRoute === "kiosk" && <KioskApp mikvehs={mikvehs.list} mikvehsCtl={mikvehs} />}
        {topRoute === "admin" && <AdminApp mikvehsCtl={mikvehs} />}
        {topRoute === "public" && <PublicApp mikvehs={mikvehs.list} />}
      </div>
      <footer style={{ textAlign: "center", padding: "18px 8px", fontSize: 12.5, color: COLORS.teal, opacity: 0.65 }}>
        מקוואות בית אל · הנתונים משותפים בין כל מי שפותח את המסמך הזה
      </footer>
    </div>
  );
}

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&family=Assistant:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      html, body { overflow-x: hidden; max-width: 100%; }
      img { max-width: 100%; height: auto; display: block; }
      input, select, textarea { max-width: 100%; }
      .two-col { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; }
      @media (max-width: 720px) {
        .two-col { grid-template-columns: 1fr; }
      }
      h1,h2,h3,.font-display { font-family: 'Heebo', sans-serif; }
      button { font-family: inherit; }
      ::selection { background: ${COLORS.gold}55; }
      .wave-divider { display:block; width:100%; height:14px; }
    `}</style>
  );
}

function WaveDivider({ color = COLORS.aqua, opacity = 0.35 }) {
  return (
    <svg className="wave-divider" viewBox="0 0 400 14" preserveAspectRatio="none">
      <path d="M0,7 C 40,0 60,14 100,7 C140,0 160,14 200,7 C240,0 260,14 300,7 C340,0 360,14 400,7"
        fill="none" stroke={color} strokeOpacity={opacity} strokeWidth="2" />
    </svg>
  );
}

function TopBar({ route, navigate }) {
  const tabs = [
    { id: "kiosk", label: "התחברות לבלניות", icon: Droplets },
    { id: "admin", label: "ניהול ובקרה", icon: ClipboardList },
  ];
  return (
    <div style={{ background: COLORS.teal }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <button onClick={() => navigate("public")} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer" }}>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="לוגו המועצה" style={{ height: 38, width: "auto", display: "block" }} />
          <span className="font-display" style={{ color: "#fff", fontWeight: 800, fontSize: 19 }}>מקוואות בית אל</span>
        </button>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", background: "#ffffff17", padding: 4, borderRadius: 12 }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = route === t.id;
            return (
              <button key={t.id} onClick={() => navigate(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9,
                  border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 600,
                  background: active ? COLORS.paper : "transparent",
                  color: active ? COLORS.teal : "#EAF3F1",
                  transition: "all .15s",
                }}>
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ height: 12, marginTop: 10, background: `linear-gradient(180deg, ${COLORS.teal}, transparent)` }}>
        <WaveDivider color="#ffffff" opacity={0.25} />
      </div>
    </div>
  );
}

/* ============================================================
   TABLET PAIRING — visiting a link the admin generated (from the
   "מקוואות" admin tab) permanently locks this browser/device into
   kiosk mode for one specific mikveh (staff-list + PIN login, no
   Google account needed — this is the "installed on a dedicated
   tablet" path from the spec).
   ============================================================ */
function KioskSetupHandler({ route, mikvehs, navigate }) {
  const parts = route.split("/"); // ["kiosk-setup", mikvehId, token]
  const mikvehId = parts[1];
  const token = parts[2];
  const mikveh = mikvehs.list.find((m) => m.id === mikvehId);
  const [done, setDone] = useState(false);

  if (!mikveh) return <SetupMessage bad title="קישור לא תקין" text="המקווה המבוקש לא נמצא. יש לבקש קישור חדש מהמנהל/ת." />;
  if (mikveh.setupToken !== token) return <SetupMessage bad title="קישור פג תוקף" text="הקישור הזה כבר לא בתוקף (יתכן שהופק קישור חדש). יש לבקש קישור עדכני מהמנהל/ת." />;

  if (done) return <SetupMessage title="ההתקנה הושלמה ✓" text={`המכשיר הזה מקושר כעת קבוע ל${mikveh.name}. אפשר לסגור את הדף הזה ולפתוח את האתר מחדש — הוא ייכנס ישירות למצב הטאבלט.`}
    action={<button style={btnPrimary} onClick={() => navigate("kiosk")}>מעבר למסך הבלנית</button>} />;

  return (
    <SetupMessage title="חיבור מכשיר זה כטאבלט קבוע" text={`את עומדת לקבוע שהמכשיר הזה (${navigator.userAgent.includes("Mobi") ? "טלפון/טאבלט" : "מחשב"} זה) ישמש כטאבלט קבוע עבור "${mikveh.name}". מעכשיו האתר ייפתח ישירות במסך כניסת בלניות (שם + קוד אישי), בלי חשבון Google. פעולה זו מיועדת למכשיר שנשאר קבוע במקווה.`}
      action={<button style={btnPrimary} onClick={() => { pairDevice(mikveh.id); setDone(true); }}><Tablet size={16} /> אישור וחיבור המכשיר</button>} />
  );
}

function SetupMessage({ title, text, action, bad }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
      <div style={{ width: "100%", maxWidth: 440, background: COLORS.paper, borderRadius: 20, padding: 28, border: `1px solid ${bad ? COLORS.red : COLORS.aqua}33`, textAlign: "center" }}>
        {bad ? <AlertTriangle size={28} color={COLORS.red} style={{ marginBottom: 10 }} /> : <Tablet size={28} color={COLORS.aqua} style={{ marginBottom: 10 }} />}
        <h2 className="font-display" style={{ margin: "0 0 8px" }}>{title}</h2>
        <p style={{ color: "#3a5250", fontSize: 14, lineHeight: 1.7, marginBottom: 18 }}>{text}</p>
        {action}
      </div>
    </div>
  );
}


/* ============================================================
   SHARED DATA HOOKS (single source used by all three apps)
   ============================================================ */
function useSystemData(mikvehId) {
  const k = (base) => `${base}:${mikvehId || "unassigned"}`;
  const [staff, setStaff, staffLoaded] = useShared("staff:global", DEFAULT_STAFF);
  const [checklist, setChecklist] = useShared(k("checklist-by-date"), {});
  const [dippersLog, setDippersLog] = useShared(k("dippers-log"), []);
  const [inventory, setInventory] = useShared(k("inventory"), DEFAULT_INVENTORY);
  const [notes, setNotes] = useShared(k("handover-notes"), []);
  const [malfunctions, setMalfunctions] = useShared(k("malfunctions"), []);
  const [emergencyAlerts, setEmergencyAlerts] = useShared(k("emergency-alerts"), []);
  const [auditLog, setAuditLog] = useShared(k("audit-log"), []);
  const [loginLog, setLoginLog] = useShared(k("login-log"), []);
  const [appointments, setAppointments] = useShared(k("appointments"), []);
  const [defaultSchedule, setDefaultSchedule] = useShared(k("default-schedule"), {});

  const addAudit = useCallback((staffName, action, details) => {
    setAuditLog((prev) => [{ id: uid(), ts: new Date().toISOString(), staffName, action, details }, ...prev].slice(0, 500));
  }, [setAuditLog]);

  return {
    staff, setStaff, staffLoaded,
    checklist, setChecklist,
    dippersLog, setDippersLog,
    inventory, setInventory,
    notes, setNotes,
    malfunctions, setMalfunctions,
    emergencyAlerts, setEmergencyAlerts,
    auditLog, addAudit,
    loginLog, setLoginLog,
    appointments, setAppointments,
    defaultSchedule, setDefaultSchedule,
  };
}

/* ============================================================
   KIOSK APP (tablet — bulaniyot)
   ============================================================ */
function useStaffEmailApprovals(mikvehs, email) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!email) { setApprovals([]); return; }
    let active = true;
    setLoading(true);
    (async () => {
      const results = await Promise.all(mikvehs.map(async (m) => {
        const staff = await storage.get(`staff:${m.id}`).catch(() => null);
        const list = staff || [];
        const match = list.find((s) => (s.email || "").trim().toLowerCase() === email.toLowerCase());
        return match ? { mikvehId: m.id, staffName: match.name } : null;
      }));
      if (active) { setApprovals(results.filter(Boolean)); setLoading(false); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mikvehs, email]);
  return [approvals, loading];
}

function KioskApp({ mikvehs, mikvehsCtl }) {
  const [deviceMikvehId] = useState(pairedMikvehId());
  const [authUser, authLoading] = useAuthUser();
  const [kioskEmails] = useShared("kiosk-emails", []);
  const [adminEmails] = useShared("admin-emails", []);
  const [chosenMikvehId, setChosenMikvehId] = useState("");
  const [entryMode, setEntryMode] = useState(null); // null | "tablet-info" | "google"
  const approvalEmail = (authUser && !authUser.isAnonymous) ? authUser.email : null;
  const [staffApprovals, staffLoading] = useStaffEmailApprovals(mikvehs, approvalEmail);

  const deviceMikveh = mikvehs.find((m) => m.id === deviceMikvehId);

  const enrichMikveh = (m) => mikvehsCtl
    ? { ...m, onManualLoad: (level) => mikvehsCtl.updateMikveh(m.id, { manualLoad: level }) }
    : m;

  // --- Path A: this device was permanently paired to one mikveh (tablet) ---
  if (deviceMikveh) {
    return <KioskShell mikveh={enrichMikveh(deviceMikveh)} presetStaffName={null} personalPhone={false}
      onLeaveDevice={() => { unpairDevice(); window.location.reload(); }} />;
  }
  if (deviceMikvehId && !deviceMikveh) {
    return <SetupMessage bad title="המקווה של המכשיר הזה נמחק" text="המנהל/ת הסירה את המקווה שהמכשיר הזה היה משויך אליו. אפשר לנתק את השיוך ולהתחבר מחדש."
      action={<button style={btnGhost} onClick={() => { unpairDevice(); window.location.reload(); }}>ניתוק המכשיר</button>} />;
  }

  // --- No device pairing yet: let the person choose how they want to connect ---
  if (entryMode === null) return <KioskEntryChoice onChooseTablet={() => setEntryMode("tablet-info")} onChooseGoogle={() => setEntryMode("google")} />;
  if (entryMode === "tablet-info") {
    return (
      <SetupMessage title="חיבור טאבלט קבוע" text='חיבור מכשיר כטאבלט קבוע נעשה על ידי המנהל/ת: בממשק "ניהול ובקרה" ← "מקוואות" יש קישור ייעודי לכל מקווה. יש לפתוח את הקישור הזה פעם אחת בדפדפן של הטאבלט הפיזי שיישאר קבוע במקווה, ומשם הכניסה תהיה תמיד ישירה עם שם וקוד אישי.'
        action={<button style={btnGhost} onClick={() => setEntryMode(null)}><ArrowRight size={15} /> חזרה</button>} />
    );
  }

  // --- Path B: personal phone — requires Google sign-in + an approved email ---
  if (authLoading) return <CenteredLoading text="בודק התחברות…" />;
  if (!authUser || authUser.isAnonymous) return <KioskGoogleGate onBack={() => setEntryMode(null)} />;
  if (staffLoading) return <CenteredLoading text="בודקת הרשאות…" />;

  const guestApprovals = kioskEmails.filter((e) => e.email.trim().toLowerCase() === authUser.email.toLowerCase())
    .map((e) => ({ mikvehId: e.mikvehId, staffName: e.staffName }));
  const isAdmin = adminEmails.some((a) => a.email.toLowerCase() === authUser.email.toLowerCase());
  const adminApprovals = isAdmin ? mikvehs.map((m) => ({ mikvehId: m.id, staffName: authUser.displayName || authUser.email })) : [];
  const approvalsByMikveh = new Map();
  [...staffApprovals, ...guestApprovals, ...adminApprovals].forEach((a) => { if (!approvalsByMikveh.has(a.mikvehId)) approvalsByMikveh.set(a.mikvehId, a); });
  const myApprovals = Array.from(approvalsByMikveh.values());
  if (myApprovals.length === 0) return <KioskNotApproved email={authUser.email} />;

  const activeChoice = chosenMikvehId
    ? myApprovals.find((a) => a.mikvehId === chosenMikvehId)
    : (myApprovals.length === 1 ? myApprovals[0] : null);

  if (!activeChoice) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
        <div style={{ width: "100%", maxWidth: 420, background: COLORS.paper, borderRadius: 20, padding: 26, border: `1px solid ${COLORS.aqua}22`, textAlign: "center" }}>
          <Smartphone size={26} color={COLORS.aqua} style={{ marginBottom: 8 }} />
          <h2 className="font-display" style={{ margin: "0 0 4px" }}>לאיזה מקווה?</h2>
          <p style={{ color: COLORS.teal, fontSize: 13.5, marginBottom: 16 }}>מחוברת ליותר ממקווה אחד — בחרי עבור איזה מהם לרשום עכשיו.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {myApprovals.map((a) => {
              const m = mikvehs.find((mm) => mm.id === a.mikvehId);
              return (
                <button key={a.mikvehId} onClick={() => setChosenMikvehId(a.mikvehId)} style={{ ...btnGhost, justifyContent: "space-between" }}>
                  <span>{m ? m.name : a.mikvehId}</span><ChevronRight size={15} style={{ transform: "scaleX(-1)" }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const mikveh = mikvehs.find((m) => m.id === activeChoice.mikvehId);
  if (!mikveh) return <SetupMessage bad title="המקווה לא נמצא" text="ייתכן שהמקווה שאושרת עבורו הוסר. יש לפנות למנהל/ת." />;

  return <KioskShell mikveh={enrichMikveh(mikveh)} presetStaffName={activeChoice.staffName} personalPhone={true}
    onLeaveDevice={() => signOutUser()} />;
}

function CenteredLoading({ text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 10, color: COLORS.teal }}>
      <Loader2 size={26} className="spin" style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 14 }}>{text}</span>
    </div>
  );
}

function KioskEntryChoice({ onChooseTablet, onChooseGoogle }) {
  const options = [
    { id: "tablet", title: "חיבור באמצעות טאבלט", desc: "למכשיר קבוע שנשאר במקווה — מחובר פעם אחת דרך קישור מהמנהל/ת, ומשם כניסה עם שם וקוד אישי.", icon: Tablet, onClick: onChooseTablet },
    { id: "google", title: "חיבור באמצעות חשבון Google", desc: "לכניסה מהטלפון האישי שלך — דורש חשבון Google שאושר מראש על ידי המנהל/ת.", icon: Smartphone, onClick: onChooseGoogle },
  ];
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
      <div style={{ width: "100%", maxWidth: 460, textAlign: "center" }}>
        <Droplets size={28} color={COLORS.aqua} style={{ marginBottom: 8 }} />
        <h2 className="font-display" style={{ margin: "0 0 6px", fontSize: 22 }}>התחברות לבלניות</h2>
        <p style={{ color: COLORS.teal, fontSize: 13.5, marginBottom: 22 }}>איך תרצי להתחבר?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <button key={o.id} onClick={o.onClick} style={{
                textAlign: "right", background: COLORS.paper, border: `1px solid ${COLORS.aqua}33`, borderRadius: 16,
                padding: 18, cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
              }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: COLORS.aquaLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={21} color={COLORS.teal} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{o.title}</div>
                  <div style={{ fontSize: 12.5, color: "#7a8f8d", marginTop: 2, lineHeight: 1.5 }}>{o.desc}</div>
                </div>
                <ChevronRight size={16} style={{ transform: "scaleX(-1)", color: COLORS.teal, flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KioskGoogleGate({ onBack }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try { await signInWithGoogle(); }
    catch (e) { setErr("ההתחברות נכשלה. נסי שוב."); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
      <div style={{ width: "100%", maxWidth: 400, background: COLORS.paper, borderRadius: 20, padding: 28, border: `1px solid ${COLORS.aqua}22`, textAlign: "center" }}>
        <Smartphone size={28} color={COLORS.aqua} style={{ marginBottom: 10 }} />
        <h2 className="font-display" style={{ margin: "0 0 6px" }}>כניסת בלנית מהטלפון האישי</h2>
        <p style={{ color: "#3a5250", fontSize: 13.5, marginBottom: 18, lineHeight: 1.6 }}>
          מכשיר זה אינו טאבלט מותקן במקווה — יש להתחבר עם חשבון Google המאושר על ידי המנהל/ת.
        </p>
        <button style={{ ...btnPrimary, margin: "0 auto" }} onClick={go} disabled={busy}>
          {busy ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <KeyRound size={16} />}
          {busy ? "מתחברת…" : "התחברות עם Google"}
        </button>
        {onBack && <button onClick={onBack} style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "#9ab0ad" }}>חזרה</button>}
        {err && <div style={{ color: COLORS.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  );
}

function KioskNotApproved({ email }) {
  return (
    <SetupMessage bad title="החשבון עדיין לא מאושר" text={`החשבון ${email} לא נמצא ברשימת הבלניות המאושרות. יש לבקש מהמנהל/ת להוסיף את הכתובת הזו במסך "הרשאות" בממשק הניהול.`}
      action={<button style={btnGhost} onClick={() => signOutUser()}><LogOut size={15} /> החלפת חשבון</button>} />
  );
}

function KioskShell({ mikveh, presetStaffName, personalPhone, onLeaveDevice }) {
  const data = useSystemData(mikveh.id);
  const [current, setCurrent] = useState(null);
  const [tab, setTab] = useState(personalPhone ? "dippers" : "dippers");
  const [toast, setToast] = useState(null);
  const [shiftModal, setShiftModal] = useState(null); // null | "close" | "transfer"
  const [transferTo, setTransferTo] = useState("");

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleLogin = (staffMember) => {
    setCurrent(staffMember);
    data.setLoginLog((prev) => [{ id: uid(), staffId: staffMember.id, staffName: staffMember.name, ts: new Date().toISOString() }, ...prev].slice(0, 400));
    data.addAudit(staffMember.name, "כניסה למשמרת", "התחברות לטאבלט הבלנית");
  };

  useEffect(() => {
    if (personalPhone && presetStaffName && !current) {
      handleLogin({ id: "google:" + presetStaffName, name: presetStaffName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalPhone, presetStaffName]);

  const today = todayStr();
  const todayEntries = data.dippersLog.filter((e) => e.date === today);
  const totalDippers = todayEntries.length;
  const totalCash = todayEntries.reduce((s, e) => s + (e.cash || 0), 0);
  const totalCredit = todayEntries.reduce((s, e) => s + (e.credit || 0), 0);
  const pendingCount = todayEntries.filter((e) => e.status === "pending").length;
  const exemptCount = todayEntries.filter((e) => e.status === "exempt").length;

  const closeShift = () => {
    const todayRec = data.checklist[today] || {};
    data.setChecklist((prev) => ({ ...prev, [today]: { ...todayRec, closed: true, closedBy: current.name, closedAt: new Date().toISOString() } }));
    data.addAudit(current.name, "סגירת משמרת", `${totalDippers} טובלות · מזומן ${fmtILS(totalCash)}`);
    setShiftModal("summary");
  };

  const transferShift = () => {
    if (!transferTo) return;
    const nextStaff = data.staff.find((s) => s.id === transferTo);
    if (!nextStaff) return;
    data.addAudit(current.name, "העברת משמרת", `הועברה ל${nextStaff.name}`);
    data.setLoginLog((prev) => [{ id: uid(), staffId: nextStaff.id, staffName: nextStaff.name, ts: new Date().toISOString() }, ...prev].slice(0, 400));
    setCurrent(nextStaff);
    setShiftModal(null);
    setTransferTo("");
    flash(`המשמרת הועברה ל${nextStaff.name} ✓`);
  };

  const handleLogout = () => {
    if (current) data.addAudit(current.name, "יציאה ממשמרת", "החלפת בלנית");
    setCurrent(null);
    setTab("dippers");
    if (personalPhone) onLeaveDevice();
  };

  if (!current) {
    if (personalPhone) return <CenteredLoading text="מתחברת…" />;
    return <KioskLogin staff={data.staff} onLogin={handleLogin} mikveh={mikveh} onLeaveDevice={onLeaveDevice} />;
  }

  const kioskTabs = [
    { id: "dippers", label: "טובלות", icon: Wallet },
    { id: "checklist", label: "פתיחה/סגירה", icon: ClipboardList },
    { id: "inventory", label: "מלאי", icon: Package },
    { id: "notes", label: "פתקים", icon: StickyNote },
    { id: "malfunctions", label: "תקלות", icon: Wrench },
  ];

  return (
    <div style={{ paddingTop: 12, position: "relative" }}>
      {/* status bar — compact for mobile */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.teal, borderRadius: 14, padding: "10px 14px", marginBottom: 12, flexWrap: "wrap", gap: 8, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#ffffff33", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>
            {current.name.slice(0, 1)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{current.name}</div>
            <div style={{ fontSize: 11.5, opacity: 0.8 }}>{mikveh.name} · {nowTime()}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button onClick={() => setShiftModal("transfer")} style={{ ...btnBase("#ffffff22", "#fff"), fontSize: 12.5, padding: "7px 12px", border: "1px solid #ffffff44" }}>
            <Users size={13} /> העברת משמרת
          </button>
          <button onClick={() => setShiftModal("close")} style={{ ...btnBase("#ef444433", "#fca5a5"), fontSize: 12.5, padding: "7px 12px", border: "1px solid #ef444455" }}>
            <Lock size={13} /> סגירת משמרת
          </button>
        </div>
      </div>

      {/* tabs — bigger touch targets */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {kioskTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "14px 18px", borderRadius: 13, border: "none",
              cursor: "pointer", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap",
              background: active ? COLORS.teal : COLORS.paper, color: active ? "#fff" : COLORS.ink,
              boxShadow: active ? "0 2px 8px #17565144" : "0 1px 2px #0000000f",
              flex: "1 1 auto", justifyContent: "center",
            }}>
              <Icon size={18} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "dippers" && <KioskDippersWithStatus data={data} mikveh={mikveh} staffName={current.name} navigate={setTab} flash={flash} />}
      {tab === "checklist" && <KioskChecklist data={data} staffName={current.name} flash={flash} />}
      {tab === "inventory" && <KioskInventory data={data} staffName={current.name} flash={flash} />}
      {tab === "notes" && <KioskNotes data={data} staffName={current.name} flash={flash} />}
      {tab === "malfunctions" && <KioskMalfunctions data={data} staffName={current.name} flash={flash} />}

      {/* Transfer shift modal */}
      {shiftModal === "transfer" && (
        <KioskModal onClose={() => setShiftModal(null)}>
          <Users size={26} color={COLORS.teal} style={{ marginBottom: 8 }} />
          <div className="font-display" style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>העברת משמרת</div>
          <p style={{ fontSize: 13.5, color: "#3a5250", marginBottom: 14 }}>בחרי את הבלנית שמחליפה. מספר הטובלות שנרשמו ממשיך להצטבר.</p>
          <select style={{ ...inputStyle, marginBottom: 14, width: "100%" }} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">בחרי בלנית…</option>
            {data.staff.filter((s) => s.id !== current.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...btnPrimary, flex: 1, justifyContent: "center", opacity: transferTo ? 1 : 0.4 }} onClick={transferShift} disabled={!transferTo}>
              <Check size={16} /> העברה
            </button>
            <button style={btnGhost} onClick={() => setShiftModal(null)}>ביטול</button>
          </div>
        </KioskModal>
      )}

      {/* Close shift confirmation */}
      {shiftModal === "close" && (
        <KioskModal onClose={() => setShiftModal(null)}>
          <Lock size={26} color={COLORS.red} style={{ marginBottom: 8 }} />
          <div className="font-display" style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>סגירת משמרת</div>
          <p style={{ fontSize: 13.5, color: "#3a5250", marginBottom: 14 }}>לאחר הסגירה יוצג סיכום המשמרת.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...btnDanger, flex: 1, justifyContent: "center" }} onClick={closeShift}><Lock size={15} /> סגירה</button>
            <button style={btnGhost} onClick={() => setShiftModal(null)}>ביטול</button>
          </div>
        </KioskModal>
      )}

      {/* Shift summary modal */}
      {shiftModal === "summary" && (
        <KioskModal onClose={() => { setShiftModal(null); handleLogout(); }}>
          <Check size={30} color={COLORS.teal} style={{ marginBottom: 8 }} />
          <div className="font-display" style={{ fontWeight: 800, fontSize: 20, marginBottom: 16 }}>סיכום משמרת</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18, textAlign: "right" }}>
            <SummaryRow label="בלנית" value={current.name} />
            <SummaryRow label="מקווה" value={mikveh.name} />
            <SummaryRow label="תאריך" value={fmtDate(today)} />
            <SummaryRow label="סה״כ טובלות" value={totalDippers} bold />
            <SummaryRow label="מזומן" value={fmtILS(totalCash)} />
            <SummaryRow label="אשראי" value={fmtILS(totalCredit)} />
            {pendingCount > 0 && <SummaryRow label="ממתינות לתשלום" value={pendingCount} warn />}
            {exemptCount > 0 && <SummaryRow label="כלות (פטורות)" value={exemptCount} />}
          </div>
          <button style={{ ...btnPrimary, width: "100%", justifyContent: "center" }} onClick={() => { setShiftModal(null); handleLogout(); }}>
            <LogOut size={15} /> סיום וניתוק
          </button>
        </KioskModal>
      )}

      <EmergencyButton data={data} staffName={current.name} flash={flash} />
      {toast && <Toast text={toast} />}
    </div>
  );
}

function btnBase(bg, fg) {
  return { background: bg, color: fg, border: "none", borderRadius: 11, padding: "11px 18px", fontWeight: 700, fontSize: 14.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 };
}
const btnPrimary = btnBase(COLORS.teal, "#fff");
const btnGold = btnBase(COLORS.gold, COLORS.ink);
const btnGhost = { ...btnBase("transparent", COLORS.teal), border: `1px solid ${COLORS.teal}55` };
const btnDanger = btnBase(COLORS.red, "#fff");

function Toast({ text }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: COLORS.ink, color: "#fff",
      padding: "12px 22px", borderRadius: 12, fontSize: 14.5, fontWeight: 600, boxShadow: "0 6px 20px #0004", zIndex: 50,
    }}>{text}</div>
  );
}

function Card({ title, icon: Icon, children, right }) {
  return (
    <div style={{ background: COLORS.paper, borderRadius: 16, padding: 20, border: `1px solid ${COLORS.aqua}22`, marginBottom: 16, maxWidth: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {Icon && <Icon size={18} color={COLORS.teal} />}
          <h3 style={{ margin: 0, fontSize: 16.5 }}>{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function KioskModal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 8px 40px #0004" }}>
        {children}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, bold, warn }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
      <span style={{ color: "#7a8f8d" }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: warn ? COLORS.red : COLORS.ink }}>{value}</span>
    </div>
  );
}

function KioskLogin({ staff, onLogin, mikveh, onLeaveDevice }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const submitDigit = (d) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setErr("");
    if (next.length === 4 && selected) {
      if (next === selected.pin) { onLogin(selected); }
      else { setErr("קוד שגוי, נסי שוב"); setTimeout(() => setPin(""), 500); }
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
      <div style={{ width: "100%", maxWidth: 420, background: COLORS.paper, borderRadius: 20, padding: 28, border: `1px solid ${COLORS.aqua}22`, textAlign: "center" }}>
        <Droplets size={30} color={COLORS.aqua} style={{ marginBottom: 8 }} />
        <h2 className="font-display" style={{ margin: "0 0 4px" }}>כניסה למשמרת</h2>
        <p style={{ color: COLORS.teal, fontSize: 13.5, marginBottom: 4 }}>{mikveh.name}</p>
        <p style={{ color: "#7a8f8d", fontSize: 12.5, marginBottom: 18 }}>מצב כיוסק · בחרי שם והזיני קוד אישי בן 4 ספרות</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
          {staff.map((s) => (
            <button key={s.id} onClick={() => { setSelected(s); setPin(""); setErr(""); }} style={{
              padding: "9px 15px", borderRadius: 11, border: `1.5px solid ${selected?.id === s.id ? COLORS.teal : "#00000018"}`,
              background: selected?.id === s.id ? COLORS.aquaLight : "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14,
            }}>{s.name}</button>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: pin.length > i ? COLORS.teal : "#00000015" }} />
          ))}
        </div>
        {err && <div style={{ color: COLORS.red, fontSize: 13, marginBottom: 10, fontWeight: 600 }}>{err}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 260, margin: "0 auto" }}>
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
            <button key={i} disabled={!selected || k === ""} onClick={() => k === "⌫" ? setPin(p => p.slice(0, -1)) : submitDigit(k)}
              style={{
                padding: "16px 0", borderRadius: 13, border: "none", fontSize: 19, fontWeight: 700, cursor: selected ? "pointer" : "default",
                background: k === "" ? "transparent" : "#fff", boxShadow: k === "" ? "none" : "0 1px 3px #0000001a", opacity: selected ? 1 : 0.4,
              }}>{k}</button>
          ))}
        </div>
        {!selected && <div style={{ marginTop: 14, fontSize: 12.5, color: COLORS.teal }}>לדוגמה בלבד: הקודים הם 1234 / 2580 / 9911</div>}
        <button onClick={onLeaveDevice} style={{ marginTop: 18, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#9ab0ad", display: "flex", alignItems: "center", gap: 4, margin: "18px auto 0" }}>
          <Settings size={12} /> ניתוק המכשיר ממקווה זה
        </button>
      </div>
    </div>
  );
}

function KioskDippersWithStatus({ data, mikveh, navigate, flash, staffName }) {
  const today = todayStr();
  const todayRec = data.checklist[today];
  const statusColor = todayRec?.closed ? "#7a8f8d" : todayRec?.opened ? COLORS.teal : COLORS.red;
  const statusText = todayRec?.closed ? "משמרת נסגרה" : todayRec?.opened ? "משמרת פתוחה" : "טרם נפתח";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: COLORS.paper, borderRadius: 14, padding: "12px 16px", marginBottom: 14, border: `1.5px solid ${statusColor}44` }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 15, color: statusColor }}>{statusText}</span>
        {!todayRec?.opened && (
          <button onClick={() => navigate("checklist")} style={{ ...btnPrimary, fontSize: 13, padding: "7px 14px", marginRight: "auto" }}>
            <Unlock size={14} /> פתיחת משמרת
          </button>
        )}
        {todayRec?.opened && !todayRec?.closed && todayRec?.chlorine && (
          <span style={{ fontSize: 12.5, color: COLORS.teal, marginRight: "auto" }}>כלור: {todayRec.chlorine} ppm · טמפ׳: {todayRec.temp}°</span>
        )}
      </div>
      {todayRec?.dailyNote && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.goldLight, borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13.5 }}>
          <Bell size={15} color={COLORS.gold} style={{ flexShrink: 0 }} />{todayRec.dailyNote}
        </div>
      )}
      <KioskDippers data={data} staffName={staffName} flash={flash} mikveh={mikveh} />
    </>
  );
}

function KioskHome({ data, mikveh, staffName, navigate, flash }) {
  const today = todayStr();
  const todayRec = data.checklist[today];
  const todayEntries = data.dippersLog.filter((e) => e.date === today);
  const todayCount = todayEntries.length;
  const pendingCount = todayEntries.filter((e) => e.status === "pending").length;
  const openTickets = data.malfunctions.filter((m) => m.status !== "טופל").length;
  const unresolvedNotes = data.notes.filter((n) => !n.resolved).length;
  const lowStock = Object.values(data.inventory).filter((i) => i.qty <= i.threshold).length;

  const statusColor = todayRec?.closed ? "#7a8f8d" : todayRec?.opened ? COLORS.teal : COLORS.red;
  const statusText = todayRec?.closed ? "משמרת נסגרה" : todayRec?.opened ? "משמרת פתוחה" : "טרם נפתח";

  const tiles = [
    { id: "dippers", label: "טובלות", icon: Wallet, badge: todayCount > 0 ? todayCount : null, badgeColor: COLORS.teal, warn: pendingCount > 0, warnText: `${pendingCount} ממתינות לתשלום`, primary: true },
    { id: "checklist", label: "פתיחה/סגירה", icon: ClipboardList, badge: null },
    { id: "notes", label: "פתקים", icon: StickyNote, badge: unresolvedNotes || null, badgeColor: COLORS.gold },
    { id: "malfunctions", label: "תקלות", icon: Wrench, badge: openTickets || null, badgeColor: COLORS.red },
    { id: "inventory", label: "מלאי", icon: Package, badge: lowStock || null, badgeColor: COLORS.gold, warnText: lowStock ? `${lowStock} פריטים בחוסר` : null },
  ];

  return (
    <div>
      {/* Shift status banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: COLORS.paper, borderRadius: 14, padding: "14px 18px", marginBottom: 18, border: `1.5px solid ${statusColor}44` }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 15, color: statusColor }}>{statusText}</span>
        {!todayRec?.opened && (
          <button onClick={() => navigate("checklist")} style={{ ...btnPrimary, fontSize: 13, padding: "7px 14px", marginRight: "auto" }}>
            <Unlock size={14} /> פתיחת משמרת
          </button>
        )}
        {todayRec?.opened && !todayRec?.closed && todayRec?.chlorine && (
          <span style={{ fontSize: 12.5, color: COLORS.teal, marginRight: "auto" }}>כלור: {todayRec.chlorine} ppm · טמפ׳: {todayRec.temp}°</span>
        )}
      </div>

      {/* Daily note if exists */}
      {todayRec?.dailyNote && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.goldLight, borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13.5 }}>
          <Bell size={15} color={COLORS.gold} style={{ flexShrink: 0 }} />
          {todayRec.dailyNote}
        </div>
      )}

      {/* Navigation tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => navigate(t.id)} style={{
              textAlign: "right", background: t.primary ? COLORS.teal : COLORS.paper, color: t.primary ? "#fff" : COLORS.ink,
              border: `1.5px solid ${t.primary ? COLORS.teal : COLORS.aqua}33`, borderRadius: 16,
              padding: 18, cursor: "pointer", position: "relative",
            }}>
              {t.badge != null && (
                <div style={{
                  position: "absolute", top: 12, left: 12, background: t.badgeColor || COLORS.teal, color: "#fff",
                  borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800,
                }}>{t.badge}</div>
              )}
              <Icon size={28} color={t.primary ? "#fff" : COLORS.teal} style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t.label}</div>
              {t.warnText && <div style={{ fontSize: 11.5, marginTop: 4, color: t.primary ? "#ffffffcc" : COLORS.gold, fontWeight: 600 }}>{t.warnText}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KioskChecklist({ data, staffName, flash }) {
  const date = todayStr();
  const rec = data.checklist[date] || { chlorine: "", temp: "", showers: false, opened: false, closed: false, openedBy: "", closedBy: "", skipReason: "" };

  const update = (patch) => {
    data.setChecklist((prev) => ({ ...prev, [date]: { ...rec, ...patch } }));
  };

  const missingMeasurement = !rec.chlorine || !rec.temp;

  const confirmOpen = () => {
    if (missingMeasurement && !rec.skipReason?.trim()) {
      flash("נא למלא כלור וטמפרטורה, או להסביר בהערה למה לא נמדדו");
      return;
    }
    update({ opened: true, openedBy: staffName, openedAt: new Date().toISOString() });
    data.addAudit(staffName, "אישור פתיחת משמרת", missingMeasurement
      ? `נפתח ללא מדידת מים — סיבה: ${rec.skipReason}`
      : `כלור: ${rec.chlorine} ppm · טמפ׳: ${rec.temp}°`);
    flash("משמרת נפתחה ✓");
  };
  const confirmClose = () => {
    update({ closed: true, closedBy: staffName, closedAt: new Date().toISOString() });
    data.addAudit(staffName, "אישור סגירת משמרת", "צ׳ק-ליסט סגירה הושלם");
    flash("משמרת נסגרה ✓");
  };

  const OK_RANGE = [1.0, 3.0]; // ppm — health ministry standard placeholder
  const chlorineVal = parseFloat(rec.chlorine);
  const chlorineWarn = rec.chlorine !== "" && !isNaN(chlorineVal) && (chlorineVal < OK_RANGE[0] || chlorineVal > OK_RANGE[1]);

  return (
    <Card title="צ׳ק-ליסט פתיחה / סגירה" icon={ClipboardList}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 16 }}>
        <Field label="רמת כלור (ppm)">
          <input value={rec.chlorine} onChange={(e) => update({ chlorine: e.target.value })} placeholder="לדוגמה 2.0" style={inputStyle} inputMode="decimal" />
          {chlorineWarn && <div style={{ color: COLORS.red, fontSize: 12, marginTop: 4, fontWeight: 600 }}>⚠ מחוץ לתקן ({OK_RANGE[0]}–{OK_RANGE[1]})</div>}
        </Field>
        <Field label="טמפרטורת מים (°C)">
          <input value={rec.temp} onChange={(e) => update({ temp: e.target.value })} placeholder="לדוגמה 38" style={inputStyle} inputMode="decimal" />
        </Field>
      </div>

      {missingMeasurement && (
        <div style={{ marginBottom: 16 }}>
          <Field label="לא נמדד כלור/טמפרטורה? נא להסביר למה (יתועד ביומן השינויים)">
            <textarea value={rec.skipReason || ""} onChange={(e) => update({ skipReason: e.target.value })} style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} placeholder='לדוגמה: "ערכת הבדיקה נגמרה, הוזמנה חדשה"' />
          </Field>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <ToggleRow label="מקלחות ותאי הכנה תקינים" checked={rec.showers} onChange={(v) => update({ showers: v })} />
      </div>

      <div style={{ marginBottom: 4 }}>
        <Field label="הודעה חד-פעמית להיום (תוצג לתושבות בדף הבית, נמחקת אוטומטית מחר)">
          <input value={rec.dailyNote || ""} onChange={(e) => update({ dailyNote: e.target.value })} style={inputStyle} placeholder='לדוגמה: "היום נסגר שעה מוקדם יותר"' />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <button style={{ ...btnPrimary, opacity: rec.opened ? 0.55 : 1 }} onClick={confirmOpen} disabled={rec.opened}>
          <Unlock size={16} /> {rec.opened ? `נפתח ע״י ${rec.openedBy}` : "אישור פתיחת משמרת"}
        </button>
        <button style={{ ...btnDanger, opacity: rec.closed ? 0.55 : 1 }} onClick={confirmClose} disabled={rec.closed || !rec.opened}>
          <Lock size={16} /> {rec.closed ? `נסגר ע״י ${rec.closedBy}` : "אישור סגירת משמרת"}
        </button>
      </div>
    </Card>
  );
}

function Field({ label, children }) {
  return <div><div style={{ fontSize: 13, fontWeight: 600, color: COLORS.teal, marginBottom: 6 }}>{label}</div>{children}</div>;
}
const inputStyle = { width: "100%", padding: "11px 13px", borderRadius: 10, border: "1.5px solid #00000018", fontSize: 15, fontFamily: "inherit" };

function ToggleRow({ label, checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderRadius: 12,
      border: `1.5px solid ${checked ? COLORS.aqua : "#00000018"}`, background: checked ? COLORS.aquaLight : "#fff", cursor: "pointer", width: "100%",
    }}>
      <span style={{ fontWeight: 600, fontSize: 14.5 }}>{label}</span>
      <span style={{
        width: 24, height: 24, borderRadius: 7, background: checked ? COLORS.aqua : "#0000000f",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{checked && <Check size={15} color="#fff" />}</span>
    </button>
  );
}

const DURATION_OPTIONS = [
  { id: "dip", label: "רק טבילה", minutes: 20 },
  { id: "prep", label: "גם התארגנות", minutes: 60 },
  { id: "bride", label: "כלה", minutes: 120 },
  { id: "custom", label: "זמן אחר", minutes: null },
];
const PAYMENT_STATUS = [
  { id: "paid-cash", label: "מזומן", color: COLORS.teal },
  { id: "paid-credit", label: "אשראי", color: COLORS.teal },
  { id: "paid-prepaid", label: "שולם מראש", color: COLORS.teal },
  { id: "pending", label: "תשלם בהמשך", color: COLORS.gold },
  { id: "exempt", label: "כלה בשנה הראשונה", color: COLORS.aqua },
];

function payStatusLabel(entry) {
  if (entry.status === "exempt") return "כלה בשנה הראשונה";
  if (entry.status === "pending") return "ממתינה לתשלום";
  if (entry.cash > 0) return `מזומן ${fmtILS(entry.cash)}`;
  if (entry.credit > 0) return `אשראי ${fmtILS(entry.credit)}`;
  if (entry.prepaid > 0) return `שולם מראש ${fmtILS(entry.prepaid)}`;
  return "שולם";
}

function KioskDippers({ data, staffName, flash, mikveh }) {
  const today = todayStr();
  const todayEntries = data.dippersLog.filter((e) => e.date === today);
  const activeEntries = todayEntries.filter((e) => !e.exitedAt);
  const todayCash = todayEntries.reduce((s, e) => s + (e.cash || 0), 0);
  const todayCredit = todayEntries.reduce((s, e) => s + (e.credit || 0), 0);
  const todayPrepaid = todayEntries.reduce((s, e) => s + (e.prepaid || 0), 0);
  const pendingCount = todayEntries.filter((e) => e.status === "pending").length;
  const exemptCount = todayEntries.filter((e) => e.status === "exempt").length;

  const [dur, setDur] = useState("");
  const [pay, setPay] = useState("");
  const [payAmount, setPayAmount] = useState("25");
  const [entryTime, setEntryTime] = useState(nowTime());
  const [localLabels, setLocalLabels] = useState({});
  const updateLabel = (id, lbl) => setLocalLabels((prev) => ({ ...prev, [id]: lbl }));

  const canSubmit = dur && pay;

  const submit = () => {
    if (!canSubmit) return;
    const durObj = DURATION_OPTIONS.find((d) => d.id === dur);
    const amount = parseFloat(payAmount) || 0;
    const entry = {
      id: uid(), date: today, time: entryTime, staffName, count: 1, duration: dur,
      minutes: durObj?.minutes || 20,
      status: pay.startsWith("paid") ? "paid" : pay,
      cash: pay === "paid-cash" ? amount : 0,
      credit: pay === "paid-credit" ? amount : 0,
      prepaid: pay === "paid-prepaid" ? amount : 0,
      tempLabel: "",
    };
    data.setDippersLog((prev) => [entry, ...prev]);
    data.addAudit(staffName, "רישום טובלת", `${durObj?.label || dur} · ${payStatusLabel(entry)}`);
    flash("נרשם ✓");
    setDur(""); setPay(""); setPayAmount("25"); setEntryTime(nowTime());
  };

  const DUR_BTNS = [
    { id: "dip",   label: "רק טבילה",       sub: "~20′", minutes: 20 },
    { id: "prep",  label: "גם התארגנות",   sub: "~60′", minutes: 60 },
    { id: "bride", label: "כלה",             sub: "~120′", minutes: 120 },
  ];
  const PAY_BTNS = [
    { id: "paid-cash",    label: "מזומן",         color: COLORS.teal },
    { id: "paid-credit",  label: "אשראי",          color: COLORS.teal },
    { id: "paid-prepaid", label: "מראש",            color: COLORS.teal },
    { id: "pending",      label: "תשלם בהמשך",    color: COLORS.gold },
    { id: "exempt",       label: "כלה בשנה הראשונה",   color: "#7c3aed" },
  ];

  return (
    <>
      {/* ── Add form ── */}
      <div style={{ background: COLORS.paper, borderRadius: 18, padding: "18px 16px", marginBottom: 14, border: `1px solid ${COLORS.aqua}22` }}>
        {/* Entry time — small, unobtrusive */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 14, fontSize: 13, color: "#7a8f8d" }}>
          <span>שעת כניסה</span>
          <input type="time" value={entryTime} onChange={(e) => setEntryTime(e.target.value)}
            style={{ border: "none", background: COLORS.seafoam, borderRadius: 8, padding: "4px 10px", fontSize: 13, color: COLORS.ink, fontWeight: 600 }} />
        </div>

        {/* Duration buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          {DUR_BTNS.map((d) => {
            const active = dur === d.id;
            return (
              <button key={d.id} onClick={() => setDur(d.id)} style={{
                padding: "16px 8px", borderRadius: 14, border: `2px solid ${active ? COLORS.teal : "#e0e8ec"}`,
                background: active ? COLORS.teal : "#fff", color: active ? "#fff" : COLORS.ink,
                fontWeight: 700, fontSize: 15, cursor: "pointer", lineHeight: 1.3, textAlign: "center",
              }}>
                {d.label}
                <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginTop: 2 }}>{d.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Payment buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          {PAY_BTNS.map((p) => {
            const active = pay === p.id;
            return (
              <button key={p.id} onClick={() => setPay(p.id)} style={{
                padding: "14px 4px", borderRadius: 14, border: `2px solid ${active ? p.color : "#e0e8ec"}`,
                background: active ? p.color : "#fff", color: active ? "#fff" : COLORS.ink,
                fontWeight: 700, fontSize: 13.5, cursor: "pointer", lineHeight: 1.3, textAlign: "center",
              }}>
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Amount — only when payment chosen and not pending/exempt */}
        {pay && pay.startsWith("paid") && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13.5, color: "#7a8f8d" }}>סכום ₪</span>
            <input type="number" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
              inputMode="decimal" style={{ width: 100, border: "2px solid #e0e8ec", borderRadius: 10, padding: "8px 12px", fontSize: 16, fontWeight: 700, textAlign: "center" }} />
          </div>
        )}

        {/* Submit */}
        <button onClick={submit} disabled={!canSubmit} style={{
          width: "100%", padding: "16px 0", borderRadius: 14, border: "none",
          background: canSubmit ? COLORS.teal : "#e0e8ec", color: canSubmit ? "#fff" : "#aaa",
          fontWeight: 800, fontSize: 17, cursor: canSubmit ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "background .15s",
        }}>
          <Plus size={20} /> רישום טובלת
        </button>
      </div>

      {/* ── Dipper list ── */}
      {todayEntries.length > 0 && (
        <div style={{ background: COLORS.paper, borderRadius: 16, padding: 16, border: `1px solid ${COLORS.aqua}22` }}>
          {/* Summary strip */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${COLORS.aqua}22` }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: COLORS.teal, lineHeight: 1 }}>{todayEntries.length}</div>
              <div style={{ fontSize: 11, color: "#7a8f8d" }}>טובלות</div>
            </div>
            {(todayCash + todayCredit + todayPrepaid) > 0 && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.teal, lineHeight: 1 }}>{fmtILS(todayCash + todayCredit + todayPrepaid)}</div>
                <div style={{ fontSize: 11, color: "#7a8f8d" }}>שולם</div>
              </div>
            )}
            {pendingCount > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 800, color: COLORS.red, lineHeight: 1 }}>{pendingCount}</div><div style={{ fontSize: 11, color: "#7a8f8d" }}>ממתינות</div></div>}
            {exemptCount > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 800, color: "#7c3aed", lineHeight: 1 }}>{exemptCount}</div><div style={{ fontSize: 11, color: "#7a8f8d" }}>פטורות</div></div>}
            {activeEntries.length > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 800, color: COLORS.gold, lineHeight: 1 }}>{activeEntries.length}</div><div style={{ fontSize: 11, color: "#7a8f8d" }}>בפנים</div></div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todayEntries.map((e) => (
              <DipperRow key={e.id} entry={e} data={data} staffName={staffName} flash={flash}
                localLabel={localLabels[e.id]} onSetLabel={updateLabel} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function DipperRow({ entry, data, staffName, flash, localLabel, onSetLabel }) {
  const [editing, setEditing] = useState(false);
  const [pay, setPay] = useState(
    entry.status === "exempt" ? "exempt"
    : entry.status === "pending" ? "pending"
    : entry.cash > 0 ? "paid-cash"
    : entry.credit > 0 ? "paid-credit"
    : entry.prepaid > 0 ? "paid-prepaid"
    : "paid-cash"
  );
  const [payAmount, setPayAmount] = useState(String(entry.cash || entry.credit || entry.prepaid || "25"));
  const [dur, setDur] = useState(entry.duration || "dip");
  const [labelInput, setLabelInput] = useState(localLabel || entry.tempLabel || "");
  const [entryTime, setEntryTime] = useState(entry.time || "");

  const durLabel = DURATION_OPTIONS.find((d) => d.id === dur)?.label || dur;
  const isExited = !!entry.exitedAt;
  const statusColor = entry.status === "pending" ? COLORS.gold
    : entry.status === "exempt" ? "#7c3aed" : COLORS.teal;

  const save = () => {
    const amount = parseFloat(payAmount) || 0;
    const patch = {
      duration: dur, time: entryTime,
      status: pay.startsWith("paid") ? "paid" : pay,
      cash: pay === "paid-cash" ? amount : 0,
      credit: pay === "paid-credit" ? amount : 0,
      prepaid: pay === "paid-prepaid" ? amount : 0,
    };
    data.setDippersLog((prev) => prev.map((e) => e.id === entry.id ? { ...e, ...patch } : e));
    if (labelInput.trim() !== (localLabel || "")) onSetLabel(entry.id, labelInput.trim());
    data.addAudit(staffName, "עריכת רשומת טובלת", `${entry.time} → ${payStatusLabel({ ...entry, ...patch })}`);
    flash("עודכן ✓");
    setEditing(false);
  };

  const markExited = () => {
    data.setDippersLog((prev) => prev.map((e) => e.id === entry.id ? { ...e, exitedAt: new Date().toISOString() } : e));
    flash("סומנה כיצאה ✓");
  };

  const PAY_BTNS = [
    { id: "paid-cash", label: "מזומן", color: COLORS.teal },
    { id: "paid-credit", label: "אשראי", color: COLORS.teal },
    { id: "paid-prepaid", label: "מראש", color: COLORS.teal },
    { id: "pending", label: "תשלם בהמשך", color: COLORS.gold },
    { id: "exempt", label: "כלה בשנה הראשונה", color: "#7c3aed" },
  ];

  return (
    <div style={{ borderRadius: 12, border: `1.5px solid ${isExited ? "#ddd" : statusColor + "44"}`,
      padding: "10px 12px", background: isExited ? "#f8f8f8" : "#fff", opacity: isExited ? 0.75 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: COLORS.ink }}>{entry.time || "—"}</span>
          <span style={{ fontSize: 13, color: "#7a8f8d" }}>{durLabel}</span>
          {(localLabel || entry.tempLabel) && <span style={{ fontSize: 12, color: COLORS.gold }}>· {localLabel || entry.tempLabel}</span>}
          {isExited && <span style={{ fontSize: 11, color: "#aaa" }}>יצאה</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: statusColor }}>{payStatusLabel(entry)}</span>
          {!isExited
            ? <button onClick={markExited} style={{ background: COLORS.aquaLight, border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, color: COLORS.teal, cursor: "pointer" }}>✓ יצאה</button>
            : <button onClick={() => data.setDippersLog((prev) => prev.map((e) => e.id === entry.id ? { ...e, exitedAt: null } : e))} style={{ background: "#f0f0f0", border: "none", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#aaa", cursor: "pointer" }}>בטל</button>
          }
          <button onClick={() => setEditing((x) => !x)} style={{ background: "#f4f8fa", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: COLORS.ink }}>
            {editing ? "סגור" : "עריכה"}
          </button>
        </div>
      </div>
      {editing && (
        <div style={{ marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", align: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#7a8f8d" }}>שעת כניסה</span>
            <input type="time" style={{ border: "2px solid #e0e8ec", borderRadius: 8, padding: "4px 8px", fontSize: 13 }} value={entryTime} onChange={(e) => setEntryTime(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DURATION_OPTIONS.filter((d) => d.id !== "custom").map((d) => (
              <button key={d.id} onClick={() => setDur(d.id)} style={{ padding: "8px 12px", borderRadius: 10, border: `2px solid ${dur === d.id ? COLORS.teal : "#e0e8ec"}`, background: dur === d.id ? COLORS.teal : "#fff", color: dur === d.id ? "#fff" : COLORS.ink, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{d.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PAY_BTNS.map((p) => (
              <button key={p.id} onClick={() => setPay(p.id)} style={{ padding: "8px 12px", borderRadius: 10, border: `2px solid ${pay === p.id ? p.color : "#e0e8ec"}`, background: pay === p.id ? p.color : "#fff", color: pay === p.id ? "#fff" : COLORS.ink, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{p.label}</button>
            ))}
          </div>
          {pay && pay.startsWith("paid") && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#7a8f8d" }}>סכום ₪</span>
              <input type="number" style={{ width: 90, border: "2px solid #e0e8ec", borderRadius: 8, padding: "6px 10px", fontSize: 14, fontWeight: 700 }} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" />
            </div>
          )}
          <Field label="כינוי זמני (לא נשמר)">
            <input style={inputStyle} value={labelInput} onChange={(e) => setLabelInput(e.target.value)} placeholder='לדוגמה: "שרה"' />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnPrimary} onClick={save}><Check size={14} /> שמירה</button>
            <button style={{ ...btnGhost, color: COLORS.red, borderColor: COLORS.red + "55" }}
              onClick={() => { if (window.confirm("למחוק?")) { data.setDippersLog((prev) => prev.filter((e) => e.id !== entry.id)); flash("נמחק ✓"); } }}>
              <Trash2 size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function KioskInventory({ data, staffName, flash }) {
  const inv = data.inventory;
  const update = (key, qty) => data.setInventory((prev) => ({ ...prev, [key]: { ...prev[key], qty: Math.max(0, qty) } }));

  const reportShortage = (key) => {
    const item = inv[key];
    data.setMalfunctions((prev) => [{ id: uid(), date: todayStr(), staffName, category: "מלאי", description: `חוסר ב${item.label} — נותרו ${item.qty} ${item.unit}`, status: "פתוח", ts: new Date().toISOString() }, ...prev]);
    data.addAudit(staffName, "דיווח חוסר במלאי", item.label);
    flash("הדיווח נשלח ✓");
  };

  return (
    <Card title="מלאי בבלאי" icon={Package}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        {Object.entries(inv).map(([key, item]) => {
          const low = item.qty <= item.threshold;
          return (
            <div key={key} style={{ padding: 16, borderRadius: 13, border: `1.5px solid ${low ? COLORS.red : "#00000015"}`, background: low ? COLORS.redLight : "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700 }}>{item.label}</span>
                {low && <span style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.red, background: "#fff", padding: "2px 8px", borderRadius: 8 }}>מלאי נמוך</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <button onClick={() => update(key, item.qty - 1)} style={roundBtn}><Minus size={16} /></button>
                <div style={{ fontSize: 22, fontWeight: 800, minWidth: 40, textAlign: "center" }}>{item.qty}</div>
                <button onClick={() => update(key, item.qty + 1)} style={roundBtn}><Plus size={16} /></button>
                <span style={{ fontSize: 12.5, color: "#3a5250" }}>{item.unit}</span>
              </div>
              {low && <button onClick={() => reportShortage(key)} style={{ ...btnDanger, fontSize: 13, padding: "8px 12px" }}><AlertTriangle size={14} /> דווח על חוסר</button>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function KioskNotes({ data, staffName, flash }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    data.setNotes((prev) => [{ id: uid(), from: staffName, text: text.trim(), ts: new Date().toISOString(), resolved: false }, ...prev]);
    data.addAudit(staffName, "פתק למשמרת הבאה", text.trim().slice(0, 60));
    setText("");
    flash("הפתק נשמר ✓");
  };
  const toggleResolved = (id) => data.setNotes((prev) => prev.map((n) => n.id === id ? { ...n, resolved: !n.resolved } : n));

  return (
    <Card title="יומן אירועים ופתקים בין בלניות" icon={StickyNote}>
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="לדוגמה: נגמרו מגבות לבנות, יש להזמין…" style={{ ...inputStyle, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button style={btnPrimary} onClick={submit}>שמירה</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.notes.length === 0 && <Empty text="אין פתקים כרגע." />}
        {data.notes.map((n) => (
          <div key={n.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: 13, borderRadius: 11, background: n.resolved ? "#f4f4f2" : COLORS.goldLight, opacity: n.resolved ? 0.6 : 1 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{n.text}</div>
              <div style={{ fontSize: 11.5, color: "#3a5250", marginTop: 3 }}>{n.from} · {fmtDateTime(n.ts)}</div>
            </div>
            <button onClick={() => toggleResolved(n.id)} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12, flexShrink: 0 }}>{n.resolved ? "בטל טופל" : "סמן כטופל"}</button>
          </div>
        ))}
      </div>
    </Card>
  );
}

const MALFUNCTION_TYPES = [
  "תחזוקה שוטפת וניקיון",
  "תיקון תקלות",
  "אחר",
];

function KioskMalfunctions({ data, staffName, flash }) {
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("");
  const [editId, setEditId] = useState(null);
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const submit = () => {
    if (!desc.trim() || !category) { flash("נא לבחור סוג ולתאר את הקריאה"); return; }
    data.setMalfunctions((prev) => [{ id: uid(), date: todayStr(), staffName, category, description: desc.trim(), status: "פתוח", ts: new Date().toISOString() }, ...prev]);
    data.addAudit(staffName, "פתיחת קריאת תקלה", `${category}: ${desc.trim().slice(0, 60)}`);
    setDesc(""); setCategory("");
    flash("הקריאה נשלחה ✓");
  };

  const startEdit = (m) => { setEditId(m.id); setEditDesc(m.description); setEditCategory(m.category); };
  const saveEdit = () => {
    data.setMalfunctions((prev) => prev.map((m) => m.id === editId ? { ...m, description: editDesc.trim(), category: editCategory } : m));
    data.addAudit(staffName, "עריכת קריאת תקלה", editDesc.trim().slice(0, 60));
    setEditId(null);
    flash("עודכן ✓");
  };
  const deleteEntry = (id) => {
    data.setMalfunctions((prev) => prev.filter((m) => m.id !== id));
    data.addAudit(staffName, "מחיקת קריאת תקלה", "");
    flash("נמחק ✓");
  };

  const statusColor = { "פתוח": COLORS.red, "בטיפול": COLORS.gold, "טופל": COLORS.aqua };

  return (
    <Card title="דיווח תקלות וקריאות שירות" icon={Wrench}>
      <div style={{ marginBottom: 12 }}>
        <Field label="סוג קריאה">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {MALFUNCTION_TYPES.map((c) => (
              <button key={c} onClick={() => setCategory(c)} style={{
                ...btnBase(category === c ? COLORS.teal : "#fff", category === c ? "#fff" : COLORS.ink),
                fontSize: 13.5, padding: "9px 14px", border: `1.5px solid ${category === c ? COLORS.teal : "#00000018"}`,
              }}>{c}</button>
            ))}
          </div>
        </Field>
      </div>
      <div style={{ marginBottom: 12 }}>
        <Field label="תיאור">
          <input value={desc} onChange={(e) => setDesc(e.target.value)} style={inputStyle} placeholder="תארי את הבעיה בקצרה" />
        </Field>
      </div>
      <button style={btnPrimary} onClick={submit}><Wrench size={16} /> פתיחת קריאה</button>

      <div style={{ marginTop: 20, borderTop: "1px solid #00000012", paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.teal, marginBottom: 10 }}>קריאות מהמקווה</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.malfunctions.length === 0 && <Empty text="אין קריאות." />}
          {data.malfunctions.map((m) => (
            <div key={m.id} style={{ borderRadius: 11, border: "1px solid #00000012", background: "#fff", overflow: "hidden" }}>
              {editId === m.id ? (
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <Field label="סוג">
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {MALFUNCTION_TYPES.map((c) => (
                        <button key={c} onClick={() => setEditCategory(c)} style={{ ...btnBase(editCategory === c ? COLORS.teal : "#fff", editCategory === c ? "#fff" : COLORS.ink), fontSize: 12.5, padding: "7px 11px", border: `1px solid ${editCategory === c ? COLORS.teal : "#00000018"}` }}>{c}</button>
                      ))}
                    </div>
                  </Field>
                  <Field label="תיאור"><input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={inputStyle} /></Field>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={btnPrimary} onClick={saveEdit}><Check size={14} /> שמירה</button>
                    <button style={btnGhost} onClick={() => setEditId(null)}>ביטול</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 11, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.category} — {m.description}</div>
                    <div style={{ fontSize: 11.5, color: "#3a5250" }}>{m.staffName} · {fmtDate(m.date)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[m.status] }}>{m.status}</span>
                    <button onClick={() => startEdit(m)} style={{ ...btnGhost, padding: "4px 8px", fontSize: 11.5 }}>עריכה</button>
                    <button onClick={() => { if (window.confirm("למחוק את הקריאה?")) deleteEntry(m.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.red }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function EmergencyButton({ data, staffName, flash }) {
  const [confirming, setConfirming] = useState(false);
  const trigger = () => {
    data.setEmergencyAlerts((prev) => [{ id: uid(), staffName, ts: new Date().toISOString() }, ...prev]);
    data.addAudit(staffName, "כפתור חירום הופעל", "התראה נשלחה למנהל המחלקה (מדומה — בייצור: SMS/Push)");
    setConfirming(false);
    flash("🚨 התראה נשלחה למנהל המחלקה");
  };
  return (
    <>
      <button onClick={() => setConfirming(true)} style={{
        position: "fixed", left: 20, bottom: 20, width: 62, height: 62, borderRadius: "50%", background: COLORS.red, color: "#fff",
        border: "none", boxShadow: "0 4px 14px #b3463a66", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40,
      }}>
        <ShieldAlert size={26} />
      </button>
      {confirming && (
        <div style={{ position: "fixed", inset: 0, background: "#00000055", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }} onClick={() => setConfirming(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 26, width: 320, textAlign: "center" }}>
            <ShieldAlert size={30} color={COLORS.red} style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>שליחת התראת חירום?</div>
            <p style={{ fontSize: 13.5, color: "#3a5250", marginBottom: 18 }}>מנהל המחלקה יקבל הודעה מיידית שאת/ה זקוקה לעזרה במקווה.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={btnGhost} onClick={() => setConfirming(false)}>ביטול</button>
              <button style={btnDanger} onClick={trigger}>שליחה מיידית</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Empty({ text }) {
  return <div style={{ textAlign: "center", padding: "20px 0", color: "#7a8f8d", fontSize: 13.5 }}>{text}</div>;
}

/* ============================================================
   ADMIN APP (department manager / treasury)
   ============================================================ */
function AdminApp({ mikvehsCtl }) {
  const [authUser, authLoading] = useAuthUser();
  const [adminEmails, setAdminEmails, adminEmailsLoaded] = useShared("admin-emails", []);
  const bootstrappedRef = useRef(false);

  // Bootstrap: nobody is an approved admin yet → the first person to sign in
  // becomes the first admin automatically, so the system isn't locked forever.
  useEffect(() => {
    if (authUser && !authUser.isAnonymous && adminEmailsLoaded && adminEmails.length === 0 && !bootstrappedRef.current) {
      bootstrappedRef.current = true;
      setAdminEmails([{ email: authUser.email.toLowerCase(), name: authUser.displayName || authUser.email, addedAt: new Date().toISOString() }]);
    }
  }, [authUser, adminEmailsLoaded, adminEmails, setAdminEmails]);

  if (authLoading || !adminEmailsLoaded) return <CenteredLoading text="בודק התחברות…" />;
  if (!authUser || authUser.isAnonymous) return <AdminGoogleGate />;

  const isApproved = adminEmails.some((a) => a.email.toLowerCase() === authUser.email.toLowerCase());
  if (!isApproved) {
    if (adminEmails.length === 0) return <CenteredLoading text="מגדירה הרשאות ראשוניות…" />;
    return <AdminNotApproved email={authUser.email} />;
  }

  return <AdminShell authUser={authUser} mikvehsCtl={mikvehsCtl} adminEmails={adminEmails} setAdminEmails={setAdminEmails} />;
}

function AdminGoogleGate() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try { await signInWithGoogle(); }
    catch (e) { setErr("ההתחברות נכשלה. נסי שוב."); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
      <div style={{ width: "100%", maxWidth: 400, background: COLORS.paper, borderRadius: 20, padding: 28, border: `1px solid ${COLORS.teal}22`, textAlign: "center" }}>
        <ShieldCheck size={28} color={COLORS.teal} style={{ marginBottom: 10 }} />
        <h2 className="font-display" style={{ margin: "0 0 6px" }}>כניסת מנהל/ת</h2>
        <p style={{ color: "#3a5250", fontSize: 13.5, marginBottom: 18, lineHeight: 1.6 }}>ממשק הניהול והבקרה דורש התחברות עם חשבון Google מאושר.</p>
        <button style={{ ...btnPrimary, margin: "0 auto" }} onClick={go} disabled={busy}>
          {busy ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <KeyRound size={16} />}
          {busy ? "מתחברת…" : "התחברות עם Google"}
        </button>
        {err && <div style={{ color: COLORS.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  );
}

function AdminNotApproved({ email }) {
  return (
    <SetupMessage bad title="החשבון לא מאושר לניהול" text={`החשבון ${email} לא נמצא ברשימת המנהלים המאושרים. יש לבקש ממנהל/ת קיים/ת להוסיף את הכתובת הזו במסך "הרשאות".`}
      action={<button style={btnGhost} onClick={() => signOutUser()}><LogOut size={15} /> החלפת חשבון</button>} />
  );
}

function AdminShell({ authUser, mikvehsCtl, adminEmails, setAdminEmails }) {
  const mikvehs = mikvehsCtl.list;
  const [mikvehId, setMikvehId] = useState(mikvehs[0]?.id || "");
  const [tab, setTab] = useState("mikvehs");

  useEffect(() => {
    if (!mikvehs.find((m) => m.id === mikvehId) && mikvehs[0]) setMikvehId(mikvehs[0].id);
  }, [mikvehs, mikvehId]);

  const mikveh = mikvehs.find((m) => m.id === mikvehId);
  const data = useSystemData(mikvehId); // still needed for AdminStaff guest list

  const tabs = [
    { id: "mikvehs", label: "מקוואות", icon: Building2 },
    { id: "dashboard", label: "דשבורד", icon: TrendingUp },
    { id: "staff", label: "ניהול בלניות", icon: Users },
    { id: "water", label: "איכות מים", icon: Thermometer },
    { id: "finance", label: "דוחות כספיים", icon: FileSpreadsheet },
    { id: "dippers-report", label: "דוח טובלות", icon: Users },
    { id: "audit", label: "יומן שינויים", icon: History },
    { id: "tickets", label: "קריאות תפעול", icon: Wrench },
    { id: "permissions", label: "הרשאות", icon: ShieldCheck },
  ];
  const needsMikveh = !["mikvehs", "permissions", "staff"].includes(tab);

  return (
    <div style={{ paddingTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: COLORS.teal }}>מחוברת כ-<b>{authUser.displayName || authUser.email}</b></div>
        <button onClick={() => signOutUser()} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}><LogOut size={13} /> התנתקות</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {tabs.map((t) => {
          const Icon = t.icon; const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 12, border: "none",
              cursor: "pointer", fontWeight: 700, fontSize: 13.8, whiteSpace: "nowrap",
              background: active ? COLORS.teal : COLORS.paper, color: active ? "#fff" : COLORS.ink,
            }}><Icon size={16} /> {t.label}</button>
          );
        })}
      </div>

      {needsMikveh && mikvehs.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <select value={mikvehId} onChange={(e) => setMikvehId(e.target.value)} style={{ ...inputStyle, width: "auto", minWidth: 220, fontWeight: 700 }}>
            {mikvehs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}

      {tab === "mikvehs" && <AdminMikvehs mikvehsCtl={mikvehsCtl} />}
      {tab === "staff" && <AdminStaff data={data} mikveh={mikveh} />}
      {tab === "permissions" && <AdminPermissions adminEmails={adminEmails} setAdminEmails={setAdminEmails} mikvehs={mikvehs} authUser={authUser} />}
      {needsMikveh && !mikveh && <Empty text="אין עדיין מקוואות במערכת — יש להוסיף מקווה בלשונית 'מקוואות'." />}
      {mikveh && <AdminMikvehContent key={mikvehId} mikvehId={mikvehId} mikveh={mikveh} tab={tab} mikvehsCtl={mikvehsCtl} />}
    </div>
  );
}

function StatMini({ label, value, warn }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: warn ? COLORS.red : COLORS.ink }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "#7a8f8d" }}>{label}</div>
    </div>
  );
}

function AdminMikvehContent({ mikvehId, mikveh, tab, mikvehsCtl }) {
  const data = useSystemData(mikvehId);
  return (
    <>
      {tab === "dashboard" && <AdminDashboard data={data} />}
      {tab === "water" && <AdminWater data={data} />}
      {tab === "finance" && <AdminFinance data={data} />}
      {tab === "dippers-report" && <AdminDippersReport mikvehsCtl={mikvehsCtl} currentMikveh={mikveh} />}
      {tab === "audit" && <AdminAudit data={data} />}
      {tab === "tickets" && <AdminTickets data={data} />}
    </>
  );
}

function AdminMikvehs({ mikvehsCtl }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const add = () => {
    if (!name.trim()) return;
    mikvehsCtl.addMikveh(name.trim(), address.trim());
    setName(""); setAddress("");
  };

  return (
    <>
      <Card title="הוספת מקווה חדש" icon={Building2}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 14 }}>
          <Field label="שם המקווה"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: מקווה שכונת הפרחים" /></Field>
          <Field label="כתובת"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        </div>
        <button style={btnPrimary} onClick={add}><Plus size={16} /> הוספת מקווה</button>
      </Card>

      {mikvehsCtl.list.length === 0 && <Empty text="אין עדיין מקוואות." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mikvehsCtl.list.map((m) => (
          <MikvehRow key={m.id} mikveh={m} mikvehsCtl={mikvehsCtl} />
        ))}
      </div>
    </>
  );
}

function MikvehRow({ mikveh, mikvehsCtl }) {
  const [expanded, setExpanded] = useState(false);
  const data = useSystemData(mikveh.id);
  const today = todayStr();
  const weekday = new Date().getDay();
  const hours = mikveh.hours || OPENING_HOURS;
  const todaysHours = (hours[weekday] || {}).hours || "לא הוגדר";

  const todayChecklist = data.checklist[today];
  const isOpenNow = !!(todayChecklist && todayChecklist.opened && !todayChecklist.closed);

  const { names: tonightNames, isActual: tonightIsActual } = tonightStaff(data, weekday, today);

  const todayDippers = data.dippersLog.filter((d) => d.date === today).reduce((s, d) => s + d.count, 0);
  const openTickets = data.malfunctions.filter((m) => m.status !== "טופל").length;
  const lowStock = Object.values(data.inventory).filter((i) => i.qty <= i.threshold).length;
  const load = estimateLoad(data.dippersLog, mikveh, today, mikveh.manualLoad);

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mikveh.address || mikveh.name)}`;

  const [form, setForm] = useState({ name: mikveh.name, address: mikveh.address || "", phone: mikveh.phone || "", notes: mikveh.notes || "", photoUrl: mikveh.photoUrl || "", pinnedNote: mikveh.pinnedNote || "", roomsCount: mikveh.roomsCount ?? 3, bathRooms: mikveh.bathRooms ?? 2, showerRooms: mikveh.showerRooms ?? 1, price: mikveh.price ?? "25", paymentUrl: mikveh.paymentUrl || "", feedbackUrl: mikveh.feedbackUrl || "" });
  useEffect(() => { setForm({ name: mikveh.name, address: mikveh.address || "", phone: mikveh.phone || "", notes: mikveh.notes || "", photoUrl: mikveh.photoUrl || "", pinnedNote: mikveh.pinnedNote || "", roomsCount: mikveh.roomsCount ?? 3, bathRooms: mikveh.bathRooms ?? 2, showerRooms: mikveh.showerRooms ?? 1, price: mikveh.price ?? "25", paymentUrl: mikveh.paymentUrl || "", feedbackUrl: mikveh.feedbackUrl || "" }); }, [mikveh.id]);
  const saveForm = () => mikvehsCtl.updateMikveh(mikveh.id, { ...form, photoUrl: toDirectImageUrl(form.photoUrl) });

  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const addPhoto = () => {
    if (!newPhotoUrl.trim()) return;
    mikvehsCtl.updateMikveh(mikveh.id, { photos: [...(mikveh.photos || []), toDirectImageUrl(newPhotoUrl.trim())] });
    setNewPhotoUrl("");
  };
  const removePhoto = (idx) => {
    mikvehsCtl.updateMikveh(mikveh.id, { photos: (mikveh.photos || []).filter((_, i) => i !== idx) });
  };

  const [newAmenity, setNewAmenity] = useState("");
  const addAmenity = () => {
    if (!newAmenity.trim()) return;
    mikvehsCtl.updateMikveh(mikveh.id, { amenities: [...(mikveh.amenities || []), newAmenity.trim()] });
    setNewAmenity("");
  };
  const removeAmenity = (idx) => {
    mikvehsCtl.updateMikveh(mikveh.id, { amenities: (mikveh.amenities || []).filter((_, i) => i !== idx) });
  };

  const setHourDay = (dayIdx, value) => {
    const next = hours.map((d, i) => i === dayIdx ? { ...d, hours: value } : d);
    mikvehsCtl.updateMikveh(mikveh.id, { hours: next });
  };

  const pairingUrl = `${window.location.origin}${window.location.pathname}#/kiosk-setup/${mikveh.id}/${mikveh.setupToken}`;
  const [copied, setCopied] = useState(false);
  const copyPairing = async () => {
    try { await navigator.clipboard.writeText(pairingUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch (e) { /* clipboard blocked — link is still selectable text */ }
  };

  return (
    <div style={{ background: COLORS.paper, borderRadius: 15, border: `1px solid ${COLORS.aqua}22`, overflow: "hidden" }}>
      <div onClick={() => setExpanded((x) => !x)} style={{
        width: "100%", textAlign: "right", background: "none", border: "none", cursor: "pointer", padding: 16,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 200 }}>
          {mikveh.photoUrl ? (
            <img src={mikveh.photoUrl} alt="" style={{ width: 40, height: 40, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 11, background: isOpenNow ? COLORS.aquaLight : COLORS.seafoam, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Building2 size={19} color={isOpenNow ? COLORS.teal : COLORS.gold} />
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{mikveh.name}</div>
            <div style={{ fontSize: 12, color: "#7a8f8d", display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} /> {mikveh.address || "כתובת לא הוגדרה"}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: isOpenNow ? COLORS.aquaLight : COLORS.redLight, color: isOpenNow ? COLORS.teal : COLORS.red, whiteSpace: "nowrap" }}>
            {isOpenNow ? "פתוח עכשיו" : "סגור עכשיו"}
          </span>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{todaysHours}</div>
            <div style={{ fontSize: 10, color: "#7a8f8d" }}>שעות היום</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 70 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{tonightNames.length ? tonightNames.join(", ") : "לא שובצה"}</div>
            <div style={{ fontSize: 10, color: "#7a8f8d" }}>בלנית הערב{!tonightIsActual && tonightNames.length ? " (משובצת)" : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <StatMini label="טובלות היום" value={todayDippers} />
            <StatMini label="קריאות פתוחות" value={openTickets} warn={openTickets > 0} />
            <StatMini label="מלאי נמוך" value={lowStock} warn={lowStock > 0} />
            {isOpenNow && <LoadBadge load={load} inline />}
          </div>
          <a href={mapsUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...btnGhost, padding: "7px 12px", fontSize: 12.5, textDecoration: "none" }}>
            <Navigation size={13} /> ניווט
          </a>
          <ChevronRight size={17} style={{ transform: expanded ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform .15s", color: COLORS.teal }} />
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${COLORS.aqua}22`, padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.teal, marginBottom: 8 }}>פרטי המקווה</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 10 }}>
              <Field label="שם"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="כתובת"><input style={inputStyle} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              <Field label="טלפון"><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="עלות טבילה (₪)"><input style={inputStyle} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="25" inputMode="decimal" /></Field>
            </div>
            <Field label="קישור לתשלום מקוון (ייפתח כשהתושבת תלחץ 'לתשלום')">
              <input style={inputStyle} value={form.paymentUrl} onChange={(e) => setForm({ ...form, paymentUrl: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="קישור לטופס משוב (ייפתח כשהתושבת תלחץ 'משוב')">
              <input style={inputStyle} value={form.feedbackUrl} onChange={(e) => setForm({ ...form, feedbackUrl: e.target.value })} placeholder="https://forms.google.com/..." />
            </Field>
            <Field label="הערות נוספות (יוצגו לתושבות בממשק הציבורי, בתוך 'עוד פרטים')">
              <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div style={{ marginTop: 10 }}>
              <Field label="הודעה קבועה לדף הבית (מוצגת תמיד, בבירור, בשורת המקווה)">
                <input style={inputStyle} value={form.pinnedNote} onChange={(e) => setForm({ ...form, pinnedNote: e.target.value })} placeholder='לדוגמה: "בשיפוצים — ייתכנו שינויים בשעות"' />
              </Field>
            </div>
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <Field label="חדרי אמבטיה (גם טבילה וגם התארגנות)">
                <input type="number" min="0" style={inputStyle} value={form.bathRooms} onChange={(e) => setForm({ ...form, bathRooms: Math.max(0, parseInt(e.target.value,10)||0) })} />
              </Field>
              <Field label="חדרי מקלחת (טבילה בלבד)">
                <input type="number" min="0" style={inputStyle} value={form.showerRooms} onChange={(e) => setForm({ ...form, showerRooms: Math.max(0, parseInt(e.target.value,10)||0) })} />
              </Field>
            </div>
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <Field label="עומס ידני (גובר על החישוב האוטומטי)">
                <select style={inputStyle} value={mikveh.manualLoad ?? ""} onChange={(e) => mikvehsCtl.updateMikveh(mikveh.id, { manualLoad: e.target.value || null })}>
                  <option value="">אוטומטי</option>
                  <option value="green">🟢 פנוי</option>
                  <option value="orange">🟠 עמוס</option>
                  <option value="red">🔴 מלא / ממתינות</option>
                </select>
              </Field>
            </div>
            <div style={{ marginTop: 10 }}>
              <Field label="תמונה ראשית — הדבקי קישור מ-Google Drive, Dropbox, או כל URL ישיר">
                <input style={inputStyle} value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} placeholder="https://drive.google.com/file/d/..." />
              </Field>
              {form.photoUrl && (
                <img src={toDirectImageUrl(form.photoUrl)} alt="" style={{ marginTop: 8, width: "100%", maxWidth: 260, height: 130, objectFit: "cover", borderRadius: 10, border: "1px solid #00000012" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button style={btnPrimary} onClick={saveForm}><Check size={15} /> שמירת פרטים</button>
              <div style={{ flex: 1, minWidth: 220 }}>
                <ToggleRow label="נגישות לנכים (מעלון)" checked={!!mikveh.accessible} onChange={(v) => mikvehsCtl.updateMikveh(mikveh.id, { accessible: v })} />
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.teal, marginBottom: 2 }}>נגישות ופרטים נוספים (מוצג לתושבות בעמוד הציבורי)</div>
            <p style={{ fontSize: 11.5, color: "#7a8f8d", marginTop: 0, marginBottom: 8 }}>את/ה קובעת בדיוק אילו שורות יופיעו שם — למשל "חניה נגישה", "ערכות בלנית למכירה" וכו'.</p>
            {(mikveh.amenities || []).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {mikveh.amenities.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.seafoam, borderRadius: 9, padding: "7px 11px" }}>
                    <span style={{ fontSize: 13 }}>{a}</span>
                    <button onClick={() => removeAmenity(i)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.red }}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={newAmenity} onChange={(e) => setNewAmenity(e.target.value)} placeholder="לדוגמה: חניה נגישה בסמוך לכניסה" onKeyDown={(e) => e.key === "Enter" && addAmenity()} />
              <button style={{ ...btnGhost, flexShrink: 0 }} onClick={addAmenity}><Plus size={15} /> הוספה</button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.teal, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}><ImagePlus size={14} /> תמונות נוספות</div>
            <p style={{ fontSize: 11.5, color: "#7a8f8d", marginTop: 0, marginBottom: 8 }}>הדביקי קישור לתמונה מתויקת בענן (Google Drive ציבורי, Imgur וכו') — אין עדיין העלאת קבצים ישירה.</p>
            {(mikveh.photos || []).length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                {mikveh.photos.map((url, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={url} alt="" style={{ width: 140, height: 110, objectFit: "cover", borderRadius: 10, border: "1px solid #00000012" }}
                      onError={(e) => { e.currentTarget.style.opacity = 0.25; }} />
                    <button onClick={() => removePhoto(i)} style={{
                      position: "absolute", top: -6, left: -6, width: 22, height: 22, borderRadius: "50%", background: COLORS.red, color: "#fff",
                      border: "2px solid #fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={newPhotoUrl} onChange={(e) => setNewPhotoUrl(e.target.value)} placeholder="https://..." onKeyDown={(e) => e.key === "Enter" && addPhoto()} />
              <button style={{ ...btnGhost, flexShrink: 0 }} onClick={addPhoto}><Plus size={15} /> הוספה</button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.teal, marginBottom: 8 }}>שעות פתיחה שבועיות</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hours.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 56, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{d.day}</span>
                  <input style={{ ...inputStyle, flex: 1 }} value={d.hours} onChange={(e) => setHourDay(i, e.target.value)} />
                </div>
              ))}
            </div>
          </div>



          <div style={{ background: COLORS.seafoam, borderRadius: 11, padding: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Tablet size={13} /> קישור להתקנת טאבלט קבוע במקווה זה</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ flex: 1, minWidth: 160, fontSize: 11.5, background: "#fff", padding: "6px 9px", borderRadius: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pairingUrl}</code>
              <button onClick={copyPairing} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11.5 }}><Copy size={12} /> {copied ? "הועתק!" : "העתקה"}</button>
              <button onClick={() => mikvehsCtl.regenerateToken(mikveh.id)} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11.5 }}><RefreshCw size={12} /> קישור חדש</button>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: "#7a8f8d" }}>לפתוח את הקישור בדפדפן הטאבלט הפיזי שיישאר קבוע במקווה — פעולה חד-פעמית.</div>
          </div>

          <AttendanceInline data={data} mikvehId={mikveh.id} />

          <button onClick={() => { if (window.confirm(`למחוק את "${mikveh.name}"? כל הנתונים שלו יישארו מאוחסנים אך לא יוצגו יותר.`)) mikvehsCtl.removeMikveh(mikveh.id); }}
            style={{ ...btnGhost, color: COLORS.red, borderColor: COLORS.red + "55", alignSelf: "flex-start" }}>
            <Trash2 size={14} /> מחיקת המקווה
          </button>
        </div>
      )}
    </div>
  );
}

function AttendanceInline({ data, mikvehId }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${COLORS.aqua}22`, paddingTop: 16 }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen((x) => !x); }} style={{
        display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
        cursor: "pointer", fontWeight: 700, fontSize: 14.5, color: COLORS.teal, padding: 0,
      }}>
        <CalendarCheck size={16} />
        ניהול נוכחות בלניות
        <ChevronRight size={15} style={{ transform: open ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform .15s" }} />
      </button>
      {open && (
        <div style={{ marginTop: 16 }}>
          <AdminAttendance key={mikvehId} data={data} mikvehId={mikvehId} />
        </div>
      )}
    </div>
  );
}

function AdminPermissions({ adminEmails, setAdminEmails, mikvehs, authUser }) {
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const addAdmin = () => {
    if (!newAdminEmail.trim()) return;
    setAdminEmails((prev) => [...prev, { email: newAdminEmail.trim().toLowerCase(), name: newAdminName.trim() || newAdminEmail.trim(), addedAt: new Date().toISOString() }]);
    setNewAdminEmail(""); setNewAdminName("");
  };
  const removeAdmin = (email) => {
    if (adminEmails.length <= 1) { window.alert("לא ניתן להסיר את המנהל/ת האחרון/ה — כך לא תישארי חסומה מחוץ למערכת."); return; }
    setAdminEmails((prev) => prev.filter((a) => a.email !== email));
  };

  return (
    <Card title="מנהלי מערכת — כניסה ל'ניהול ובקרה'" icon={ShieldCheck}>
      <p style={{ fontSize: 13, color: "#3a5250", marginTop: 0 }}>רק כתובות Google ברשימה הזו יוכלו להתחבר לממשק הניהול. (הרשאות כניסה לבלניות עברו ללשונית "ניהול בלניות" של כל מקווה.)</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
        <input placeholder="שם" style={inputStyle} value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} />
        <input placeholder="[email protected]" style={inputStyle} value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} />
        <button style={btnPrimary} onClick={addAdmin}><Plus size={15} /> הוספה</button>
      </div>
      <Table headers={["שם", "אימייל", ""]}
        rows={adminEmails.map((a) => [a.name, a.email, a.email === authUser.email.toLowerCase() ? <span key="me" style={{ fontSize: 11.5, color: "#7a8f8d" }}>את/ה</span> : <button key="x" onClick={() => removeAdmin(a.email)} style={{ ...btnGhost, padding: "4px 8px", fontSize: 11.5, color: COLORS.red }}><Trash2 size={12} /></button>])}
        empty="אין מנהלים מוגדרים." />
    </Card>
  );
}

function StatCard({ label, value, icon: Icon, color = COLORS.teal }) {
  return (
    <div style={{ background: COLORS.paper, borderRadius: 14, padding: 18, border: `1px solid ${color}22`, flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color, marginBottom: 8 }}>
        <Icon size={16} /><span style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Heebo'" }}>{value}</div>
    </div>
  );
}

function AdminDashboard({ data }) {
  const today = todayStr();
  const todayChecklist = data.checklist[today];
  const todayEntries = data.dippersLog.filter((e) => e.date === today);
  const todayDippers = todayEntries.reduce((s, e) => s + e.count, 0);
  const openTickets = data.malfunctions.filter((m) => m.status !== "טופל").length;
  const lowStock = Object.values(data.inventory).filter((i) => i.qty <= i.threshold).length;

  // predictive-style analytics: average dippers by weekday, computed from real logged history
  const byWeekday = useMemo(() => {
    const buckets = WEEKDAYS_HE.map((d) => ({ day: d, total: 0, count: 0 }));
    data.dippersLog.forEach((e) => {
      const idx = new Date(e.date).getDay();
      buckets[idx].total += e.count;
      buckets[idx].count += 1;
    });
    return buckets.map((b) => ({ day: b.day, ממוצע: b.count ? Math.round((b.total / b.count) * 10) / 10 : 0 }));
  }, [data.dippersLog]);

  const busiest = [...byWeekday].sort((a, b) => b.ממוצע - a.ממוצע)[0];

  return (
    <>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard label="טובלות היום" value={todayDippers} icon={Users} />
        <StatCard label="סטטוס צ׳ק-ליסט" value={todayChecklist?.closed ? "נסגר" : todayChecklist?.opened ? "פתוח" : "טרם נפתח"} icon={ClipboardList} color={todayChecklist?.opened ? COLORS.aqua : COLORS.red} />
        <StatCard label="קריאות פתוחות" value={openTickets} icon={Wrench} color={openTickets ? COLORS.red : COLORS.aqua} />
        <StatCard label="פריטים במלאי נמוך" value={lowStock} icon={Package} color={lowStock ? COLORS.gold : COLORS.aqua} />
      </div>

      <Card title="חיזוי עומסים — ממוצע טובלות לפי יום בשבוע" icon={TrendingUp}
        right={busiest.ממוצע > 0 && <span style={{ fontSize: 12.5, color: COLORS.gold, fontWeight: 700 }}>יום עמוס: {busiest.day}</span>}>
        {data.dippersLog.length === 0 ? (
          <Empty text="עדיין אין נתוני היסטוריה — הגרף יתמלא ככל שיירשמו ביקורים בטאבלט." />
        ) : (
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byWeekday}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fontFamily: "Assistant" }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="ממוצע" fill={COLORS.aqua} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {busiest.ממוצע > 0 && (
          <div style={{ marginTop: 12, fontSize: 13.5, background: COLORS.goldLight, padding: 12, borderRadius: 10 }}>
            💡 המלצה אוטומטית: ביום <b>{busiest.day}</b> נרשם העומס הגבוה ביותר בממוצע — מומלץ לשבץ 2 בלניות במשמרת.
          </div>
        )}
      </Card>
    </>
  );
}

function AdminStaff({ data, mikveh }) {
  const [kioskEmails, setKioskEmails] = useShared("kiosk-emails", []);
  const guestList = kioskEmails.filter((e) => e.mikvehId === mikveh.id);

  const [editing, setEditing] = useState(null); // staff id currently being edited, or "new"
  const emptyDraft = { name: "", phone: "", email: "", pin: "" };
  const [draft, setDraft] = useState(emptyDraft);

  const startEdit = (s) => { setEditing(s.id); setDraft({ name: s.name, phone: s.phone || "", email: s.email || "", pin: s.pin || "" }); };
  const startNew = () => { setEditing("new"); setDraft(emptyDraft); };
  const cancelEdit = () => { setEditing(null); setDraft(emptyDraft); };

  const saveEdit = () => {
    if (!draft.name.trim() || !/^\d{4}$/.test(draft.pin)) return;
    if (editing === "new") {
      data.setStaff((prev) => [...prev, { id: uid(), name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim().toLowerCase(), pin: draft.pin }]);
    } else {
      data.setStaff((prev) => prev.map((s) => s.id === editing ? { ...s, name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim().toLowerCase(), pin: draft.pin } : s));
    }
    cancelEdit();
  };
  const removeStaff = (id) => {
    if (window.confirm("להסיר את הבלנית מהצוות? זה גם יבטל את שיבוצה בסידור הנוכחות.")) {
      data.setStaff((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const addGuest = () => {
    if (!guestName.trim() || !guestEmail.trim()) return;
    setKioskEmails((prev) => [...prev, { email: guestEmail.trim().toLowerCase(), staffName: guestName.trim(), mikvehId: mikveh.id, addedAt: new Date().toISOString() }]);
    setGuestName(""); setGuestEmail("");
  };
  const removeGuest = (email) => setKioskEmails((prev) => prev.filter((e) => !(e.mikvehId === mikveh.id && e.email === email)));

  return (
    <>
      <Card title="צוות בלניות" icon={Users} right={!editing && <button style={{ ...btnGhost, padding: "7px 12px", fontSize: 12.5 }} onClick={startNew}><Plus size={14} /> בלנית חדשה</button>}>
        <p style={{ fontSize: 12.5, color: "#7a8f8d", marginTop: 0 }}>
          רשימה כלל-מועצתית — מופיעה בכל המקוואות. שיבוץ הבלניות למקוואות נעשה בנוכחות וסידור (בתוך כל מקווה). כתובת המייל מאפשרת כניסה מהטלפון האישי.
        </p>
        {editing && (
          <div style={{ background: COLORS.seafoam, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 10 }}>
              <Field label="שם"><input style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="טלפון"><input style={inputStyle} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
              <Field label="אימייל (Google)"><input style={inputStyle} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="[email protected]" /></Field>
              <Field label="קוד אישי (4 ספרות, לכניסה בטאבלט)"><input style={inputStyle} value={draft.pin} maxLength={4} inputMode="numeric" onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, "") })} /></Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnPrimary} onClick={saveEdit}><Check size={15} /> שמירה</button>
              <button style={btnGhost} onClick={cancelEdit}>ביטול</button>
            </div>
          </div>
        )}
        <Table headers={["שם", "טלפון", "אימייל", "קוד", ""]}
          rows={data.staff.map((s) => [s.name, s.phone || "—", s.email || "—", s.pin, (
            <div key="actions" style={{ display: "flex", gap: 6 }}>
              <button onClick={() => startEdit(s)} style={{ ...btnGhost, padding: "4px 8px", fontSize: 11.5 }}>עריכה</button>
              <button onClick={() => removeStaff(s.id)} style={{ ...btnGhost, padding: "4px 8px", fontSize: 11.5, color: COLORS.red }}><Trash2 size={12} /></button>
            </div>
          )])}
          empty="אין עדיין בלניות בצוות." />
      </Card>

      <Card title="הרשאות כניסה נוספות" icon={KeyRound}>
        <p style={{ fontSize: 12.5, color: "#7a8f8d", marginTop: 0 }}>
          למי שאינה חלק קבוע מהצוות (למשל מחליפה חד-פעמית) — מאשר כניסה מהטלפון האישי בלי להוסיף אותה לצוות הקבוע.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
          <input placeholder="שם" style={inputStyle} value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          <input placeholder="[email protected]" style={inputStyle} value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
          <button style={btnPrimary} onClick={addGuest}><Plus size={15} /> הוספה</button>
        </div>
        <Table headers={["שם", "אימייל", ""]}
          rows={guestList.map((g) => [g.staffName, g.email, <button key="x" onClick={() => removeGuest(g.email)} style={{ ...btnGhost, padding: "4px 8px", fontSize: 11.5, color: COLORS.red }}><Trash2 size={12} /></button>])}
          empty="אין הרשאות נוספות." />
      </Card>
    </>
  );
}

function AdminAttendance({ data, mikvehId }) {
  const storageKey = `default-schedule:${mikvehId || "unassigned"}`;
  const recent = data.loginLog.slice(0, 15);

  // Load draft directly from Firestore to avoid the useShared async-load race condition
  const [draft, setDraft] = useState(null); // null = still loading
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    storage.get(storageKey).then((val) => {
      if (active) setDraft(val && typeof val === "object" ? val : {});
    }).catch(() => { if (active) setDraft({}); });
    return () => { active = false; };
  }, [storageKey]);

  const patchDraft = (updater) => setDraft((prev) => {
    const next = typeof updater === "function" ? updater(prev || {}) : updater;
    console.log("[Attendance] patchDraft prev:", JSON.stringify(prev), "→ next:", JSON.stringify(next));
    return { ...next };
  });

  const saveAll = async () => {
    setSaving(true); setError(""); setSaved(false);
    console.log("[Attendance] saving to key:", storageKey, "draft:", JSON.stringify(draft));
    try {
      const result = await storage.set(storageKey, draft);
      console.log("[Attendance] storage.set result:", result);
      // Update in-memory state so UI and other components reflect saved data immediately
      data.setDefaultSchedule(() => draft);
      // Verify round-trip by reading back
      const verify = await storage.get(storageKey);
      console.log("[Attendance] verify read-back:", verify);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("[Attendance] save error:", e);
      setError("שגיאה בשמירה: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  // ─── Default shifts ────────────────────────────────────────────────────────
  if (draft === null) return <CenteredLoading text="טוענת שיבוצים…" />;

  const defaultShifts = (draft.__defaultShifts) || (
    draft.__default ? [{ staffId: draft.__default, start: "", end: "" }] : []
  );
  const [defStaffId, setDefStaffId] = useState("");
  const [defStart, setDefStart] = useState("20:00");
  const [defEnd, setDefEnd] = useState("23:30");
  const addDefaultShift = () => {
    if (!defStaffId) return;
    const next = [...defaultShifts, { staffId: defStaffId, start: defStart, end: defEnd }];
    patchDraft((prev) => ({ ...prev, __defaultShifts: next, __default: next[0]?.staffId || null }));
    setDefStaffId(""); setDefStart("20:00"); setDefEnd("23:30");
  };
  const removeDefaultShift = (idx) => {
    const next = defaultShifts.filter((_, i) => i !== idx);
    patchDraft((prev) => ({ ...prev, __defaultShifts: next, __default: next[0]?.staffId || null }));
  };

  // ─── Bulk shift add ────────────────────────────────────────────────────────
  const [selectedDays, setSelectedDays] = useState([]);
  const [bulkStaffId, setBulkStaffId] = useState("");
  const [bulkStart, setBulkStart] = useState("20:00");
  const [bulkEnd, setBulkEnd] = useState("23:30");
  const [bulkType, setBulkType] = useState("weekly");
  const [bulkDate, setBulkDate] = useState(todayStr());
  const toggleDay = (i) => setSelectedDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]);
  const selectAll = () => setSelectedDays(selectedDays.length === 7 ? [] : [0,1,2,3,4,5,6]);
  const selectWeekdays = () => setSelectedDays([0,1,2,3,4]);

  const addBulkShift = () => {
    if (!bulkStaffId || !selectedDays.length) return;
    const shift = { staffId: bulkStaffId, start: bulkStart, end: bulkEnd };
    if (bulkType === "once") {
      patchDraft((prev) => {
        const ovr = { ...(prev.__overrides || {}) };
        selectedDays.forEach((d) => {
          const date = nthWeekdayDate(d, bulkDate);
          ovr[date] = [...(ovr[date] || []), shift];
        });
        return { ...prev, __overrides: ovr };
      });
    } else {
      patchDraft((prev) => {
        const next = { ...prev };
        selectedDays.forEach((d) => {
          next[d] = [...(Array.isArray(prev[d]) ? prev[d] : []), shift];
        });
        return next;
      });
    }
    setSelectedDays([]); setBulkStaffId("");
  };

  const removeWeeklyShift = (day, idx) => {
    patchDraft((prev) => ({ ...prev, [day]: (Array.isArray(prev[day]) ? prev[day] : []).filter((_, i) => i !== idx) }));
  };
  const overrides = draft.__overrides || {};
  const removeOverride = (date, idx) => {
    patchDraft((prev) => {
      const ovr = { ...(prev.__overrides || {}) };
      const arr = (ovr[date] || []).filter((_, i) => i !== idx);
      if (arr.length === 0) delete ovr[date]; else ovr[date] = arr;
      return { ...prev, __overrides: ovr };
    });
  };

  return (
    <>
      {/* ── Default staff ── */}
      <Card title="בלנית/ות ברירת מחדל למקווה זה" icon={Users}>
        <p style={{ fontSize: 12.5, color: "#7a8f8d", marginTop: 0 }}>
          מוצגות בכל יום שאין בו שיבוץ ספציפי. כל מקווה מנהל ברירת מחדל משלו.
        </p>
        {defaultShifts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {defaultShifts.map((s, idx) => {
              const st = data.staff.find((x) => x.id === s.staffId);
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.aquaLight, borderRadius: 9, padding: "8px 12px" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {st?.name || "?"}{s.start && <span style={{ fontWeight: 400, color: "#7a8f8d" }}> · {s.start}–{s.end || "?"}</span>}
                  </span>
                  <button onClick={() => removeDefaultShift(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.red }}><X size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 140 }} value={defStaffId} onChange={(e) => setDefStaffId(e.target.value)}>
            <option value="">בחרי בלנית…</option>
            {data.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="time" style={{ ...inputStyle, width: "auto" }} value={defStart} onChange={(e) => setDefStart(e.target.value)} />
          <span>–</span>
          <input type="time" style={{ ...inputStyle, width: "auto" }} value={defEnd} onChange={(e) => setDefEnd(e.target.value)} />
          <button style={{ ...btnGhost, opacity: defStaffId ? 1 : 0.4 }} onClick={addDefaultShift} disabled={!defStaffId}><Plus size={14} /> הוספה</button>
        </div>
      </Card>

      {/* ── Bulk add ── */}
      <Card title="הוספת שיבוץ — קבוע או חד-פעמי" icon={CalendarCheck}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {[["כולם", selectAll], ["א'–ה'", selectWeekdays]].map(([label, fn]) => (
            <button key={label} onClick={fn} style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }}>{label}</button>
          ))}
          {WEEKDAYS_HE.map((day, i) => (
            <button key={i} onClick={() => toggleDay(i)} style={{
              ...btnBase(selectedDays.includes(i) ? COLORS.teal : "#fff", selectedDays.includes(i) ? "#fff" : COLORS.ink),
              fontSize: 12.5, padding: "6px 11px", border: `1px solid ${selectedDays.includes(i) ? COLORS.teal : "#00000018"}`,
            }}>{day}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 140 }} value={bulkStaffId} onChange={(e) => setBulkStaffId(e.target.value)}>
            <option value="">בחרי בלנית…</option>
            {data.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="time" style={{ ...inputStyle, width: "auto" }} value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} />
          <span>–</span>
          <input type="time" style={{ ...inputStyle, width: "auto" }} value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[["weekly", "קבוע (כל שבוע)"], ["once", "חד-פעמי (תאריך)"]].map(([id, label]) => (
            <button key={id} onClick={() => setBulkType(id)} style={{
              ...btnBase(bulkType === id ? COLORS.teal : "#fff", bulkType === id ? "#fff" : COLORS.ink),
              fontSize: 13, padding: "8px 13px", border: `1px solid ${bulkType === id ? COLORS.teal : "#00000018"}`,
            }}>{label}</button>
          ))}
          {bulkType === "once" && <input type="date" style={{ ...inputStyle, width: "auto" }} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />}
        </div>
        <button style={{ ...btnGhost, opacity: (bulkStaffId && selectedDays.length) ? 1 : 0.4 }}
          onClick={addBulkShift} disabled={!bulkStaffId || !selectedDays.length}>
          <Plus size={14} /> {bulkType === "once" ? "הוספת שיבוץ חד-פעמי" : "הוספת שיבוץ קבוע"}
        </button>
      </Card>

      {/* ── Weekly schedule ── */}
      <Card title="שיבוץ שבועי קבוע" icon={CalendarCheck}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {WEEKDAYS_HE.map((day, i) => {
            const shifts = Array.isArray(draft[i]) ? draft[i] : [];
            const defNames = defaultShifts.map((s) => { const st = data.staff.find((x) => x.id === s.staffId); return (st?.name || "?") + (s.start ? ` ${s.start}–${s.end}` : ""); }).join(", ");
            return (
              <div key={i} style={{ borderTop: i > 0 ? "1px solid #00000010" : "none", paddingTop: i > 0 ? 10 : 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5, color: COLORS.teal }}>{day}</div>
                {shifts.length === 0 && <div style={{ fontSize: 12, color: "#b0c4c2" }}>{defNames ? `ברירת מחדל: ${defNames}` : "ללא שיבוץ"}</div>}
                {shifts.map((s, idx) => {
                  const st = data.staff.find((x) => x.id === s.staffId);
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.aquaLight, borderRadius: 9, padding: "7px 11px", marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}><b>{st?.name || "?"}</b>{s.start && <span style={{ color: "#7a8f8d" }}> · {s.start}–{s.end || "?"}</span>}</span>
                      <button onClick={() => removeWeeklyShift(i, idx)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.red }}><X size={14} /></button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── One-time overrides ── */}
      {Object.keys(overrides).length > 0 && (
        <Card title="שיבוצים חד-פעמיים" icon={CalendarCheck}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(overrides).sort().map(([date, shifts]) => (
              <div key={date} style={{ background: COLORS.goldLight, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{fmtDate(date)}</div>
                {(Array.isArray(shifts) ? shifts : [shifts]).map((s, idx) => {
                  const st = data.staff.find((x) => x.id === s.staffId);
                  return (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12.5 }}>{st?.name || "?"}{s.start ? ` · ${s.start}–${s.end}` : ""}</span>
                      <button onClick={() => removeOverride(date, idx)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.red }}><X size={14} /></button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Save button ── */}
      <div style={{ background: COLORS.paper, borderRadius: 14, padding: 16, border: `1px solid ${COLORS.aqua}22`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button style={{ ...btnPrimary, fontSize: 15, padding: "12px 24px", opacity: saving ? 0.6 : 1 }} onClick={saveAll} disabled={saving}>
          {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={16} />}
          {saving ? "שומר…" : "שמירת כל השיבוצים"}
        </button>
        {saved && <span style={{ fontSize: 13.5, color: COLORS.teal, fontWeight: 700 }}>✓ נשמר בהצלחה ב-Firestore</span>}
        {error && <span style={{ fontSize: 13, color: COLORS.red, fontWeight: 600 }}>{error}</span>}
        <span style={{ fontSize: 12, color: "#7a8f8d" }}>שינויים שלא נשמרו לא יישמרו אחרי רענון</span>
      </div>

      {/* ── Actual login log ── */}
      <Card title="כניסות בפועל" icon={CalendarCheck}>
        <Table headers={["בלנית", "תאריך", "שעה"]}
          rows={recent.map((l) => [l.staffName, fmtDate(l.ts), fmtDateTime(l.ts).split(" ")[1]])}
          empty="עדיין אין רישומי כניסה." />
      </Card>
    </>
  );
}

function nthWeekdayDate(dayIdx, baseDate) {
  const base = new Date(baseDate);
  const diff = dayIdx - base.getDay();
  const result = new Date(base);
  result.setDate(base.getDate() + diff);
  return result.toISOString().slice(0, 10);
}

function AdminWater({ data }) {
  const rows = Object.entries(data.checklist)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14)
    .map(([date, r]) => ({ date: date.slice(5), כלור: parseFloat(r.chlorine) || 0, טמפרטורה: parseFloat(r.temp) || 0 }))
    .reverse();
  const missingToday = !data.checklist[todayStr()]?.opened;

  return (
    <Card title="בקרה על איכות המים" icon={Thermometer} right={missingToday && <span style={{ color: COLORS.red, fontSize: 12.5, fontWeight: 700 }}>⚠ טרם דווח היום</span>}>
      {rows.length === 0 ? <Empty text="אין עדיין דיווחי כלור/טמפרטורה." /> : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="כלור" stroke={COLORS.aqua} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="טמפרטורה" stroke={COLORS.gold} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function AdminDippersReport({ mikvehsCtl, currentMikveh }) {
  const mikvehs = mikvehsCtl.list;
  const [selectedMikvehId, setSelectedMikvehId] = useState("all");
  const [period, setPeriod] = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState(todayStr());
  const [allLogs, setAllLogs] = useState(null);

  // Load dippers logs for all mikvehs
  useEffect(() => {
    let active = true;
    setAllLogs(null);
    (async () => {
      const results = await Promise.all(mikvehs.map(async (m) => {
        const raw = await storage.get(`dippers-log:${m.id}`).catch(() => null);
        return { mikvehId: m.id, mikvehName: m.name, entries: Array.isArray(raw) ? raw : [] };
      }));
      if (active) setAllLogs(results);
    })();
    return () => { active = false; };
  }, [mikvehs]);

  const now = new Date();
  const filtered = useMemo(() => {
    if (!allLogs) return [];
    let from, to;
    if (period === "24h") { from = new Date(now.getTime() - 24 * 3600000); to = now; }
    else if (period === "month") { from = new Date(now.getFullYear(), now.getMonth(), 1); to = now; }
    else if (period === "year") { from = new Date(now.getFullYear(), 0, 1); to = now; }
    else { from = customFrom ? new Date(customFrom) : new Date(0); to = customTo ? new Date(customTo + "T23:59:59") : now; }

    const sources = selectedMikvehId === "all" ? allLogs : allLogs.filter((s) => s.mikvehId === selectedMikvehId);
    const rows = [];
    sources.forEach(({ mikvehId, mikvehName, entries }) => {
      entries.forEach((e) => {
        const d = new Date(e.date + (e.time ? "T" + e.time : ""));
        if (d >= from && d <= to) rows.push({ ...e, mikvehId, mikvehName });
      });
    });
    return rows.sort((a, b) => (b.date + (b.time || "")) < (a.date + (a.time || "")) ? -1 : 1);
  }, [allLogs, selectedMikvehId, period, customFrom, customTo]);

  const totals = filtered.reduce((acc, e) => ({
    count: acc.count + 1,
    cash: acc.cash + (e.cash || 0),
    credit: acc.credit + (e.credit || 0),
    prepaid: acc.prepaid + (e.prepaid || 0),
    pending: acc.pending + (e.status === "pending" ? 1 : 0),
    exempt: acc.exempt + (e.status === "exempt" ? 1 : 0),
  }), { count: 0, cash: 0, credit: 0, prepaid: 0, pending: 0, exempt: 0 });

  const durLabel = (e) => DURATION_OPTIONS.find((d) => d.id === e.duration)?.label || e.duration || "—";

  const exportCsv = () => {
    const header = `תאריך,שעה,מקווה,בלנית,כולל התארגנות,סטטוס תשלום,מזומן,אשראי,מראש\n`;
    const body = filtered.map((e) => [
      e.date, e.time || "", e.mikvehName, e.staffName,
      durLabel(e),
      e.status === "exempt" ? "פטורה" : e.status === "pending" ? "ממתינה" : "שולם",
      e.cash || 0, e.credit || 0, e.prepaid || 0,
    ].join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `דוח-טובלות-${todayStr()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const PERIODS = [
    { id: "24h", label: "24 שעות אחרונות" },
    { id: "month", label: "חודש נוכחי" },
    { id: "year", label: "שנה נוכחית" },
    { id: "custom", label: "תקופה בחירה" },
  ];

  const showMikveh = selectedMikvehId === "all" && mikvehs.length > 1;

  return (
    <Card title="דוח טובלות" icon={Users}
      right={<button style={{ ...btnGhost, padding: "7px 12px", fontSize: 12.5 }} onClick={exportCsv}><Download size={14} /> ייצוא CSV</button>}>

      {/* Mikveh selector */}
      {mikvehs.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={() => setSelectedMikvehId("all")} style={{ ...btnBase(selectedMikvehId === "all" ? COLORS.teal : "#fff", selectedMikvehId === "all" ? "#fff" : COLORS.ink), fontSize: 13, padding: "8px 13px", border: `1px solid ${selectedMikvehId === "all" ? COLORS.teal : "#00000018"}` }}>
            כל המקוואות
          </button>
          {mikvehs.map((m) => (
            <button key={m.id} onClick={() => setSelectedMikvehId(m.id)} style={{ ...btnBase(selectedMikvehId === m.id ? COLORS.teal : "#fff", selectedMikvehId === m.id ? "#fff" : COLORS.ink), fontSize: 13, padding: "8px 13px", border: `1px solid ${selectedMikvehId === m.id ? COLORS.teal : "#00000018"}` }}>
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Period selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)} style={{ ...btnBase(period === p.id ? COLORS.teal : "#fff", period === p.id ? "#fff" : COLORS.ink), fontSize: 13, padding: "8px 13px", border: `1px solid ${period === p.id ? COLORS.teal : "#00000018"}` }}>{p.label}</button>
        ))}
      </div>
      {period === "custom" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <Field label="מ-"><input type="date" style={{ ...inputStyle, width: "auto" }} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></Field>
          <Field label="עד"><input type="date" style={{ ...inputStyle, width: "auto" }} value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></Field>
        </div>
      )}

      {allLogs === null ? <CenteredLoading text="טוענת נתונים…" /> : (
        <>
          {/* Summary */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <StatCard label="טובלות" value={totals.count} icon={Users} />
            <StatCard label="מזומן" value={fmtILS(totals.cash)} icon={Wallet} color={COLORS.gold} />
            <StatCard label="אשראי" value={fmtILS(totals.credit)} icon={Wallet} color={COLORS.aqua} />
            <StatCard label="מראש" value={fmtILS(totals.prepaid)} icon={Wallet} />
            {totals.pending > 0 && <StatCard label="ממתינות לתשלום" value={totals.pending} icon={Clock3} color={COLORS.red} />}
            {totals.exempt > 0 && <StatCard label="פטורות (כלה)" value={totals.exempt} icon={Gift} color={COLORS.aqua} />}
          </div>

          {/* Table */}
          <Table
            headers={["תאריך", "שעה", ...(showMikveh ? ["מקווה"] : []), "בלנית", "סוג", "תשלום", "סכום"]}
            rows={filtered.map((e) => [
              fmtDate(e.date),
              e.time || "—",
              ...(showMikveh ? [e.mikvehName] : []),
              e.staffName || "—",
              durLabel(e),
              e.status === "exempt" ? "פטורה" : e.status === "pending" ? "⏳ ממתינה" : "✓ שולם",
              fmtILS((e.cash || 0) + (e.credit || 0) + (e.prepaid || 0)),
            ])}
            empty="אין רשומות בתקופה זו."
          />
        </>
      )}
    </Card>
  );
}

function AdminFinance({ data }) {
  const [month, setMonth] = useState(new Date().getMonth());
  const filtered = data.dippersLog.filter((e) => new Date(e.date).getMonth() === month);
  const totals = filtered.reduce((acc, e) => ({ cash: acc.cash + (e.cash || 0), credit: acc.credit + (e.credit || 0), prepaid: acc.prepaid + (e.prepaid || 0), count: acc.count + e.count }), { cash: 0, credit: 0, prepaid: 0, count: 0 });

  const exportCsv = () => {
    const header = "תאריך,שעה,בלנית,טובלות,מזומן,אשראי,מראש\n";
    const body = filtered.map((e) => [e.date, e.time, e.staffName, e.count, e.cash, e.credit, e.prepaid].join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `דוח-כספי-${MONTHS_HE[month]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card title="דוח כספי חודשי" icon={FileSpreadsheet} right={
      <div style={{ display: "flex", gap: 8 }}>
        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} style={{ ...inputStyle, padding: "6px 10px" }}>
          {MONTHS_HE.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <button style={{ ...btnGhost, padding: "8px 12px", fontSize: 12.5 }} onClick={exportCsv}><Download size={14} /> ייצוא ל-CSV</button>
      </div>}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard label="טובלות" value={totals.count} icon={Users} />
        <StatCard label="מזומן" value={fmtILS(totals.cash)} icon={Wallet} color={COLORS.gold} />
        <StatCard label="אשראי" value={fmtILS(totals.credit)} icon={Wallet} color={COLORS.aqua} />
        <StatCard label="שולם מראש באתר" value={fmtILS(totals.prepaid)} icon={Wallet} />
      </div>
      <Table headers={["תאריך", "שעה", "בלנית", "טובלות", "מזומן", "אשראי", "מראש"]}
        rows={filtered.map((e) => [fmtDate(e.date), e.time, e.staffName, e.count, fmtILS(e.cash), fmtILS(e.credit), fmtILS(e.prepaid)])}
        empty="אין רישומים לחודש זה." />
    </Card>
  );
}

function AdminAudit({ data }) {
  const [q, setQ] = useState("");
  const filtered = data.auditLog.filter((a) => (a.staffName + a.action + a.details).includes(q));
  return (
    <Card title="יומן שינויים (Audit Log)" icon={History} right={
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש…" style={{ ...inputStyle, width: 160, padding: "7px 10px" }} />
    }>
      <Table headers={["מתי", "מי", "פעולה", "פרטים"]}
        rows={filtered.slice(0, 100).map((a) => [fmtDateTime(a.ts), a.staffName, a.action, a.details])}
        empty="אין עדיין רישומים ביומן." />
    </Card>
  );
}

function AdminTickets({ data }) {
  const setStatus = (id, status) => data.setMalfunctions((prev) => prev.map((m) => m.id === id ? { ...m, status } : m));
  return (
    <>
      <Card title="קריאות תפעול מול המועצה" icon={Wrench}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.malfunctions.length === 0 && <Empty text="אין קריאות תקלה." />}
          {data.malfunctions.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 13, borderRadius: 11, border: "1px solid #00000012", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.category} — {m.description}</div>
                <div style={{ fontSize: 12, color: "#3a5250" }}>{m.staffName} · {fmtDate(m.date)}</div>
              </div>
              <select value={m.status} onChange={(e) => setStatus(m.id, e.target.value)} style={{ ...inputStyle, width: 130, padding: "7px 10px" }}>
                {["פתוח", "בטיפול", "טופל"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Card>
      {data.emergencyAlerts.length > 0 && (
        <Card title="התראות חירום שהתקבלו" icon={ShieldAlert}>
          <Table headers={["מתי", "בלנית"]} rows={data.emergencyAlerts.slice(0, 20).map((a) => [fmtDateTime(a.ts), a.staffName])} empty="" />
        </Card>
      )}
    </>
  );
}

function Table({ headers, rows, empty }) {
  if (rows.length === 0) return <Empty text={empty} />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr>{headers.map((h) => <th key={h} style={{ textAlign: "right", padding: "9px 10px", color: COLORS.teal, fontWeight: 700, borderBottom: `2px solid ${COLORS.aqua}33` }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #00000010" }}>
              {r.map((c, j) => <td key={j} style={{ padding: "9px 10px" }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
   PUBLIC APP (residents)
   ============================================================ */
function PublicApp({ mikvehs }) {
  if (mikvehs.length === 0) {
    return <div style={{ paddingTop: 40 }}><Empty text="אין כרגע מקוואות פעילים במערכת." /></div>;
  }

  return (
    <div style={{ paddingTop: 18, display: "flex", flexDirection: "column", gap: 28 }}>
      {mikvehs.map((m) => <PublicMikvehDetail key={m.id} mikveh={m} />)}
    </div>
  );
}

function scheduleShifts(defaultSchedule, weekday, dateStr) {
  if (!defaultSchedule) return [];
  // 1. Check one-time overrides for this specific date
  if (dateStr) {
    const overrides = defaultSchedule.__overrides || {};
    if (overrides[dateStr]) return overrides[dateStr];
  }
  // 2. Weekly recurring shifts
  const v = defaultSchedule[weekday];
  if (Array.isArray(v) && v.length) return v;
  if (v && typeof v === "string") return [{ staffId: v, start: "", end: "" }]; // old format
  // 3. Default shifts (multi-staff with hours)
  if (defaultSchedule.__defaultShifts?.length) return defaultSchedule.__defaultShifts;
  // 4. Old single-staff __default fallback
  if (defaultSchedule.__default) return [{ staffId: defaultSchedule.__default, start: "", end: "" }];
  return [];
}

const DURATION_MINUTES = { dip: 20, prep: 60, bride: 120, custom: 30 };

function estimateLoad(dippersLog, mikveh, today, manualLoad) {
  // Manual override takes full precedence
  if (manualLoad) return { level: manualLoad, manual: true, freeInMin: null, dipOnlyFree: false };

  const bathRooms = mikveh.bathRooms ?? (mikveh.roomsCount ?? 1);
  const showerRooms = mikveh.showerRooms ?? 0;
  const totalRooms = bathRooms + showerRooms;

  const now = new Date();
  // Build active visits with their expected exit times
  const active = [];
  dippersLog.filter((e) => e.date === today && !e.exitedAt).forEach((e) => {
    if (!e.time) return;
    const [h, m] = e.time.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return;
    const start = new Date(now); start.setHours(h, m, 0, 0);
    const durMin = e.customMinutes || DURATION_MINUTES[e.duration] || 20;
    const end = new Date(start.getTime() + durMin * 60000);
    if (now < end) {
      active.push({ needsPrep: e.duration !== "dip", exitAt: end, durMin });
    }
  });

  const prepCount = active.filter((a) => a.needsPrep).length;
  const dipOnlyCount = active.filter((a) => !a.needsPrep).length;

  // Capacity check: prep visitors need bath rooms, dip-only can use any room
  const prepOverflow = Math.max(0, prepCount - bathRooms);
  const dipOnlyOverflow = Math.max(0, (dipOnlyCount + Math.min(prepCount, bathRooms)) - totalRooms);
  const overflow = prepOverflow + dipOnlyOverflow;
  const total = active.length;

  // Next room to free up
  const sortedExits = active.map((a) => a.exitAt).sort((a, b) => a - b);
  const freeInMin = sortedExits.length ? Math.max(0, Math.round((sortedExits[0] - now) / 60000)) : null;

  // Can dip-only visitors enter even if prep rooms are full?
  const dipOnlyFree = showerRooms > 0 && dipOnlyCount < showerRooms;

  let level = "green";
  if (overflow > 0) level = "red";
  else if (total / totalRooms >= 0.8) level = "orange";

  return { level, manual: false, freeInMin, dipOnlyFree, total, totalRooms, prepCount, dipOnlyCount, overflow };
}

function LoadBadge({ load, inline }) {
  if (!load) return null;
  const colors = { green: "#22c55e", orange: "#f97316", red: "#ef4444" };
  const labels = { green: "פנוי", orange: "עמוס", red: "מלא" };
  const bg = { green: "#dcfce7", orange: "#ffedd5", red: "#fee2e2" };
  const c = colors[load.level] || colors.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: bg[load.level], color: c, borderRadius: 10, padding: "4px 11px",
        fontWeight: 700, fontSize: inline ? 12 : 13.5,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, flexShrink: 0 }} />
        {labels[load.level]}{load.manual ? " (ידני)" : ""}
      </span>
      {load.freeInMin != null && load.level !== "green" && (
        <span style={{ fontSize: 11.5, color: "#7a8f8d" }}>
          חדר פנוי בעוד ~{load.freeInMin} ד׳
        </span>
      )}
      {load.dipOnlyFree && load.level !== "green" && (
        <span style={{ fontSize: 11.5, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>
          חדר מקלחת פנוי (טבילה בלבד)
        </span>
      )}
    </div>
  );
}

function tonightStaff(data, weekday, today) {
  if (!data || !data.defaultSchedule) return { shifts: [], names: [], isActual: false };
  const todayRec = data.checklist[today];
  const shiftClosed = !!(todayRec && todayRec.closed);

  // Only use actual logins when the shift is currently open
  if (!shiftClosed) {
    const actual = data.loginLog.filter((l) => l.ts.slice(0, 10) === today);
    const scheduled = scheduleShifts(data.defaultSchedule, weekday, today);
    if (actual.length) {
      const shifts = actual.map((l) => {
        const match = scheduled.find((s) => {
          const st = data.staff.find((x) => x.id === s.staffId);
          return st && st.name === l.staffName;
        });
        return { name: l.staffName, start: match?.start || "", end: match?.end || "", isActual: true };
      });
      return { shifts, names: shifts.map((s) => s.name), isActual: true };
    }
  }

  // Shift closed or no actual login yet — show scheduled/default
  const scheduled = scheduleShifts(data.defaultSchedule, weekday, today);
  const shifts = scheduled.map((s) => {
    const st = data.staff.find((x) => x.id === s.staffId);
    if (!st) return null;
    return { name: st.name, start: s.start || "", end: s.end || "", isActual: false };
  }).filter(Boolean);
  return { shifts, names: shifts.map((s) => s.name), isActual: false };
}

function PublicMikvehDetail({ mikveh }) {
  const data = useSystemData(mikveh.id);
  const today = todayStr();
  const weekday = new Date().getDay();
  const hours = mikveh.hours || OPENING_HOURS;
  const todaysHours = (hours[weekday] || {}).hours || "לא הוגדר";
  const isOpenDay = todaysHours !== "סגור";
  const [expanded, setExpanded] = useState(false);

  const { shifts: tonightShifts, names: tonightNames, isActual: tonightIsActual } = tonightStaff(data, weekday, today);
  const load = estimateLoad(data.dippersLog, mikveh, today, mikveh.manualLoad);
  const todayRec = data.checklist[today];
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mikveh.address || mikveh.name)}`;

  return (
    <>
      <div style={{ background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.aqua})`, borderRadius: 20, padding: 26, color: "#fff", marginBottom: 16, position: "relative", overflow: "hidden" }}>
        {mikveh.photoUrl && (
          <img src={mikveh.photoUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.32 }}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
        <div style={{ position: "absolute", inset: 0, opacity: 0.15 }}>
          <WaveDivider color="#fff" opacity={1} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: isOpenDay ? "#8CE0B0" : "#EFA6A0" }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{isOpenDay ? "פתוח היום" : "סגור היום"}</span>
            {isOpenDay && todayRec?.opened && !todayRec?.closed && (
              <LoadBadge load={load} inline />
            )}
          </div>
          <h1 className="font-display" style={{ margin: "0 0 6px", fontSize: 26 }}>{mikveh.name}</h1>
          <p style={{ margin: "0 0 6px", opacity: 0.95, fontSize: 15 }}>שעות פתיחה היום ({WEEKDAYS_HE[weekday]}): <b>{todaysHours}</b></p>
          {tonightShifts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {tonightShifts.map((s, i) => (
                <p key={i} style={{ margin: 0, opacity: 0.9, fontSize: 14 }}>
                  {i === 0 ? "בלנית הערב: " : <span style={{ opacity: 0 }}>בלנית הערב: </span>}
                  <b>{s.name}</b>
                  {s.start ? <> · {s.start}–{s.end || "?"}</> : ""}
                  {!tonightIsActual && <span style={{ opacity: 0.7, fontSize: 12 }}> (משובצת)</span>}
                </p>
              ))}
            </div>
          )}
          <p style={{ marginTop: 4, opacity: 0.9, fontSize: 13 }}>{mikveh.address}{mikveh.phone && <> · {mikveh.phone}</>}</p>
          {(mikveh.pinnedNote || todayRec?.dailyNote) && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {mikveh.pinnedNote && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#ffffff22", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
                  <Info size={14} style={{ flexShrink: 0 }} /> {mikveh.pinnedNote}
                </div>
              )}
              {todayRec?.dailyNote && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#ffffff22", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>
                  <Bell size={14} style={{ flexShrink: 0 }} /> {todayRec.dailyNote}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ ...btnGold, textDecoration: "none" }}><Navigation size={15} /> ניווט למקווה</a>
            {mikveh.paymentUrl && (
              <a href={mikveh.paymentUrl} target="_blank" rel="noreferrer" style={{ ...btnBase("#ffffff22", "#fff"), textDecoration: "none" }}>
                <Wallet size={15} /> לתשלום מקוון
              </a>
            )}
            {mikveh.feedbackUrl && (
              <a href={mikveh.feedbackUrl} target="_blank" rel="noreferrer" style={{ ...btnBase("#ffffff22", "#fff"), textDecoration: "none" }}>
                <MessageSquare size={15} /> משוב
              </a>
            )}
            <button onClick={() => setExpanded((x) => !x)} style={{ ...btnBase("#ffffff22", "#fff") }}>
              {expanded ? "הסתרת פרטים" : "עוד פרטים"} <ChevronRight size={14} style={{ transform: expanded ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div>
          {mikveh.price && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: COLORS.aquaLight, borderRadius: 12, padding: "12px 16px", marginBottom: 4 }}>
              <Wallet size={16} color={COLORS.teal} />
              <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.teal }}>עלות טבילה: ₪{mikveh.price}</span>
              {mikveh.paymentUrl && (
                <a href={mikveh.paymentUrl} target="_blank" rel="noreferrer" style={{ ...btnPrimary, fontSize: 12.5, padding: "6px 12px", textDecoration: "none", marginRight: "auto" }}>
                  לתשלום מקוון
                </a>
              )}
            </div>
          )}
          <Card title="שעות פתיחה שבועיות" icon={Clock}>
            <Table headers={["יום", "שעות"]} rows={hours.map((d) => [d.day, d.hours])} empty="" />
          </Card>
          {(mikveh.photos || []).length > 0 && <PublicMikvehDetailPhotos photos={mikveh.photos} />}
          <PublicMikvehDetailExtras mikveh={mikveh} />
        </div>
      )}
    </>
  );
}

function PhotoGallery({ photos }) {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {photos.map((url, i) => (
          <img key={i} src={url} alt="" onClick={() => setSelected(url)}
            style={{ width: 160, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid #00000012", cursor: "zoom-in" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ))}
      </div>
      {selected && (
        <div onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, cursor: "zoom-out" }}>
          <img src={selected} alt="" style={{ maxWidth: "90vw", maxHeight: "88vh", borderRadius: 12, boxShadow: "0 8px 40px #000a" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <button onClick={() => setSelected(null)} style={{
            position: "fixed", top: 16, left: 16, background: "#fff2", border: "none", borderRadius: "50%",
            width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          }}><X size={20} /></button>
        </div>
      )}
    </>
  );
}

function PublicMikvehDetailPhotos({ photos }) {
  return (
    <Card title="תמונות מהמקווה" icon={Image}>
      <PhotoGallery photos={photos} />
    </Card>
  );
}

function PublicMikvehDetailExtras({ mikveh }) {
  return (
    <>
      {mikveh.notes && (
        <Card title="מידע נוסף מהמקווה" icon={StickyNote}>
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{mikveh.notes}</p>
        </Card>
      )}
      {(mikveh.accessible || (mikveh.amenities || []).length > 0) && (
        <Card title="נגישות ומוצרים במקום" icon={Accessibility}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              mikveh.accessible ? "מעלון נגיש לבעלות מוגבלות" : null,
              ...(mikveh.amenities || []),
            ].filter(Boolean).map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Check size={16} color={COLORS.aqua} /><span style={{ fontSize: 14 }}>{f}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
