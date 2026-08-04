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
  Link2, Copy, Tablet, Smartphone, Settings, Trash2, KeyRound, Loader2
} from "lucide-react";

/* ============================================================
   DESIGN TOKENS (see inline comments) — teal/seafoam civic palette
   grounded in water + tradition, avoiding cliché AI defaults.
   ============================================================ */
const COLORS = {
  ink: "#0F3230",
  teal: "#175651",
  aqua: "#3F8C86",
  aquaLight: "#DCEEEC",
  seafoam: "#F2F7F6",
  gold: "#C79A3E",
  goldLight: "#F6EBD2",
  red: "#B3463A",
  redLight: "#F8E4E1",
  paper: "#FBFAF7",
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
  { id: "s1", name: "רחל כהן", pin: "1234" },
  { id: "s2", name: "מירי לוי", pin: "2580" },
  { id: "s3", name: "שרה אזולאי", pin: "9911" },
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
  { id: "m1", name: "מקווה מרכזי", address: "רח' הרצל 12", setupToken: uid() },
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
    setList((prev) => [...prev, { id: uid(), name, address, setupToken: uid() }]);
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
      <div dir="rtl" style={{ background: COLORS.seafoam, minHeight: "100%", fontFamily: "'Assistant', sans-serif", color: COLORS.ink }}>
        <FontLoader />
        <CenteredLoading text="טוענת…" />
      </div>
    );
  }

  // one-time tablet pairing link: #/kiosk-setup/{mikvehId}/{token}
  if (route.startsWith("kiosk-setup/")) {
    return (
      <div dir="rtl" style={{ background: COLORS.seafoam, minHeight: "100%", fontFamily: "'Assistant', sans-serif", color: COLORS.ink }}>
        <FontLoader />
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 16px 48px" }}>
          <KioskSetupHandler route={route} mikvehs={mikvehs} navigate={navigate} />
        </div>
      </div>
    );
  }

  const topRoute = route === "public" ? "public" : route === "admin" ? "admin" : "kiosk";

  return (
    <div dir="rtl" style={{ background: COLORS.seafoam, minHeight: "100%", fontFamily: "'Assistant', sans-serif", color: COLORS.ink }}>
      <FontLoader />
      <TopBar route={topRoute} navigate={navigate} />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 16px 48px" }}>
        {topRoute === "kiosk" && <KioskApp mikvehs={mikvehs.list} />}
        {topRoute === "admin" && <AdminApp mikvehsCtl={mikvehs} />}
        {topRoute === "public" && <PublicApp mikvehs={mikvehs.list} />}
      </div>
      <footer style={{ textAlign: "center", padding: "18px 8px", fontSize: 12.5, color: COLORS.teal, opacity: 0.65 }}>
        רשת המקוואות · הנתונים משותפים בין כל מי שפותח את המסמך הזה
      </footer>
    </div>
  );
}

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&family=Assistant:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
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
    { id: "public", label: "ממשק ציבורי", icon: Users },
    { id: "kiosk", label: "טאבלט בלנית", icon: Droplets },
    { id: "admin", label: "ניהול ובקרה", icon: ClipboardList },
  ];
  return (
    <div style={{ background: COLORS.teal }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <button onClick={() => navigate("public")} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer" }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: COLORS.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Droplets size={19} color={COLORS.ink} />
          </div>
          <span className="font-display" style={{ color: "#fff", fontWeight: 800, fontSize: 19 }}>רשת המקוואות</span>
        </button>
        <div style={{ display: "flex", gap: 4, background: "#ffffff17", padding: 4, borderRadius: 12 }}>
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
  const [staff, setStaff, staffLoaded] = useShared(k("staff"), DEFAULT_STAFF);
  const [checklist, setChecklist] = useShared(k("checklist-by-date"), {});
  const [dippersLog, setDippersLog] = useShared(k("dippers-log"), []);
  const [inventory, setInventory] = useShared(k("inventory"), DEFAULT_INVENTORY);
  const [notes, setNotes] = useShared(k("handover-notes"), []);
  const [malfunctions, setMalfunctions] = useShared(k("malfunctions"), []);
  const [emergencyAlerts, setEmergencyAlerts] = useShared(k("emergency-alerts"), []);
  const [auditLog, setAuditLog] = useShared(k("audit-log"), []);
  const [loginLog, setLoginLog] = useShared(k("login-log"), []);
  const [appointments, setAppointments] = useShared(k("appointments"), []);

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
  };
}

/* ============================================================
   KIOSK APP (tablet — bulaniyot)
   ============================================================ */
function KioskApp({ mikvehs }) {
  const [deviceMikvehId] = useState(pairedMikvehId());
  const [authUser, authLoading] = useAuthUser();
  const [kioskEmails] = useShared("kiosk-emails", []);
  const [chosenMikvehId, setChosenMikvehId] = useState("");

  const deviceMikveh = mikvehs.find((m) => m.id === deviceMikvehId);

  // --- Path A: this device was permanently paired to one mikveh (tablet) ---
  if (deviceMikveh) {
    return <KioskShell mikveh={deviceMikveh} presetStaffName={null} personalPhone={false}
      onLeaveDevice={() => { unpairDevice(); window.location.reload(); }} />;
  }
  if (deviceMikvehId && !deviceMikveh) {
    return <SetupMessage bad title="המקווה של המכשיר הזה נמחק" text="המנהל/ת הסירה את המקווה שהמכשיר הזה היה משויך אליו. אפשר לנתק את השיוך ולהתחבר מחדש."
      action={<button style={btnGhost} onClick={() => { unpairDevice(); window.location.reload(); }}>ניתוק המכשיר</button>} />;
  }

  // --- Path B: personal phone — requires Google sign-in + an approved email ---
  if (authLoading) return <CenteredLoading text="בודק התחברות…" />;
  if (!authUser || authUser.isAnonymous) return <KioskGoogleGate />;

  const myApprovals = kioskEmails.filter((e) => e.email.trim().toLowerCase() === authUser.email.toLowerCase());
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

  return <KioskShell mikveh={mikveh} presetStaffName={activeChoice.staffName} personalPhone={true}
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

function KioskGoogleGate() {
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
  const [tab, setTab] = useState("checklist");
  const [toast, setToast] = useState(null);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleLogin = (staffMember) => {
    setCurrent(staffMember);
    data.setLoginLog((prev) => [{ id: uid(), staffId: staffMember.id, staffName: staffMember.name, ts: new Date().toISOString() }, ...prev].slice(0, 400));
    data.addAudit(staffMember.name, "כניסה למשמרת", "התחברות לטאבלט הבלנית");
  };

  // personal-phone flow: Google already verified identity — log in immediately as the mapped staff name
  useEffect(() => {
    if (personalPhone && presetStaffName && !current) {
      handleLogin({ id: "google:" + presetStaffName, name: presetStaffName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalPhone, presetStaffName]);

  const handleLogout = () => {
    if (current) data.addAudit(current.name, "יציאה ממשמרת", "החלפת בלנית");
    setCurrent(null);
    setTab("checklist");
    if (personalPhone) onLeaveDevice(); // signs out of Google entirely
  };

  if (!current) {
    if (personalPhone) return <CenteredLoading text="מתחברת…" />;
    return <KioskLogin staff={data.staff} onLogin={handleLogin} mikveh={mikveh} onLeaveDevice={onLeaveDevice} />;
  }

  const kioskTabs = [
    { id: "checklist", label: "פתיחה/סגירה", icon: ClipboardList },
    { id: "dippers", label: "טובלות ותשלומים", icon: Wallet },
    { id: "inventory", label: "מלאי", icon: Package },
    { id: "notes", label: "פתקים למשמרת", icon: StickyNote },
    { id: "malfunctions", label: "תקלות", icon: Wrench },
  ];

  return (
    <div style={{ paddingTop: 18, position: "relative" }}>
      {/* status bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.paper, borderRadius: 14, padding: "12px 16px", marginBottom: 14, border: `1px solid ${COLORS.aqua}22`, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: COLORS.aquaLight, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: COLORS.teal }}>
            {current.name.slice(0, 1)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{current.name} <span style={{ fontWeight: 500, fontSize: 12, color: COLORS.teal }}>· {mikveh.name}</span></div>
            <div style={{ fontSize: 12.5, color: COLORS.teal }}>{fmtDate(todayStr())} · {weekdayOf(todayStr())} · {nowTime()}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={btnGhost}>
          <LogOut size={15} /> {personalPhone ? "התנתקות" : "החלף בלנית"}
        </button>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16 }}>
        {kioskTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "13px 18px", borderRadius: 13, border: "none",
              cursor: "pointer", fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap",
              background: active ? COLORS.teal : COLORS.paper, color: active ? "#fff" : COLORS.ink,
              boxShadow: active ? "0 2px 8px #17565144" : "0 1px 2px #0000000f",
            }}>
              <Icon size={17} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "checklist" && <KioskChecklist data={data} staffName={current.name} flash={flash} />}
      {tab === "dippers" && <KioskDippers data={data} staffName={current.name} flash={flash} />}
      {tab === "inventory" && <KioskInventory data={data} staffName={current.name} flash={flash} />}
      {tab === "notes" && <KioskNotes data={data} staffName={current.name} flash={flash} />}
      {tab === "malfunctions" && <KioskMalfunctions data={data} staffName={current.name} flash={flash} />}

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
    <div style={{ background: COLORS.paper, borderRadius: 16, padding: 20, border: `1px solid ${COLORS.aqua}22`, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
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

function KioskChecklist({ data, staffName, flash }) {
  const date = todayStr();
  const rec = data.checklist[date] || { chlorine: "", temp: "", showers: false, suppliesOk: false, opened: false, closed: false, openedBy: "", closedBy: "" };

  const update = (patch) => {
    data.setChecklist((prev) => ({ ...prev, [date]: { ...rec, ...patch } }));
  };

  const confirmOpen = () => {
    if (!rec.chlorine || !rec.temp) { flash("נא למלא כלור וטמפרטורה לפני אישור פתיחה"); return; }
    update({ opened: true, openedBy: staffName, openedAt: new Date().toISOString() });
    data.addAudit(staffName, "אישור פתיחת משמרת", `כלור: ${rec.chlorine} ppm · טמפ׳: ${rec.temp}°`);
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

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <ToggleRow label="מקלחות ותאי הכנה תקינים" checked={rec.showers} onChange={(v) => update({ showers: v })} />
        <ToggleRow label="מלאי וציוד מולאו" checked={rec.suppliesOk} onChange={(v) => update({ suppliesOk: v })} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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

function KioskDippers({ data, staffName, flash }) {
  const [count, setCount] = useState(0);
  const [cash, setCash] = useState("");
  const [credit, setCredit] = useState("");
  const [prepaid, setPrepaid] = useState("");
  const [billGiven, setBillGiven] = useState("");
  const [amountDue, setAmountDue] = useState("");
  const [listening, setListening] = useState(false);

  const todayEntries = data.dippersLog.filter((e) => e.date === todayStr());
  const todayTotal = todayEntries.reduce((s, e) => s + e.count, 0);
  const todayCash = todayEntries.reduce((s, e) => s + (e.cash || 0), 0);

  const change = (parseFloat(billGiven) || 0) - (parseFloat(amountDue) || 0);

  const submitVisit = () => {
    if (count < 1) { flash("נא לבחור מספר טובלות"); return; }
    const entry = { id: uid(), date: todayStr(), time: nowTime(), staffName, count, cash: parseFloat(cash) || 0, credit: parseFloat(credit) || 0, prepaid: parseFloat(prepaid) || 0 };
    data.setDippersLog((prev) => [entry, ...prev]);
    data.addAudit(staffName, "רישום טובלות ותשלום", `${count} טובלות · מזומן ${fmtILS(entry.cash)} · אשראי ${fmtILS(entry.credit)} · מראש ${fmtILS(entry.prepaid)}`);
    flash("נרשם בהצלחה ✓");
    setCount(0); setCash(""); setCredit(""); setPrepaid("");
  };

  const depositCash = () => {
    data.addAudit(staffName, "הפקדת קופה בסוף משמרת", `סה״כ מזומן שהופקד: ${fmtILS(todayCash)}`);
    flash("הפקדת הקופה נרשמה ✓");
  };

  const startVoice = () => {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SR) { flash("זיהוי קולי אינו נתמך בדפדפן זה"); return; }
    const rec = new SR();
    rec.lang = "he-IL";
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); flash("לא הצלחתי לשמוע, נסי שוב"); };
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      const numMatch = text.match(/(\d+)\s*טובלות/);
      const cashMatch = text.match(/(\d+)\s*(ש["״']?ח|שקלים)?\s*מזומן/) || text.match(/מזומן\s*(\d+)/);
      if (numMatch) setCount(parseInt(numMatch[1], 10));
      if (cashMatch) setCash(cashMatch[1]);
      flash(`זוהה: "${text}"`);
    };
    rec.start();
  };

  return (
    <>
      <Card title="ספירת טובלות" icon={Users} right={<div style={{ fontSize: 12.5, color: COLORS.teal }}>סה״כ היום: <b>{todayTotal}</b> · מזומן: <b>{fmtILS(todayCash)}</b></div>}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginBottom: 18 }}>
          <button onClick={() => setCount((c) => Math.max(0, c - 1))} style={roundBtn}><Minus size={20} /></button>
          <div style={{ fontSize: 44, fontWeight: 800, minWidth: 70, textAlign: "center", fontFamily: "'Heebo'" }}>{count}</div>
          <button onClick={() => setCount((c) => c + 1)} style={{ ...roundBtn, background: COLORS.teal, color: "#fff" }}><Plus size={20} /></button>
        </div>
        <button onClick={startVoice} style={{ ...btnGhost, margin: "0 auto", display: "flex" }}>
          <Mic size={16} color={listening ? COLORS.red : COLORS.teal} /> {listening ? "מקשיבה…" : "הזנה קולית"}
        </button>
      </Card>

      <Card title="פילוח תשלום" icon={Wallet}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 16 }}>
          <Field label="מזומן (₪)"><input value={cash} onChange={(e) => setCash(e.target.value)} style={inputStyle} inputMode="decimal" /></Field>
          <Field label="אשראי (₪)"><input value={credit} onChange={(e) => setCredit(e.target.value)} style={inputStyle} inputMode="decimal" /></Field>
          <Field label="שולם מראש באתר (₪)"><input value={prepaid} onChange={(e) => setPrepaid(e.target.value)} style={inputStyle} inputMode="decimal" /></Field>
        </div>
        <button style={btnPrimary} onClick={submitVisit}><Check size={16} /> רישום ביקור</button>
      </Card>

      <Card title="מחשבון עודף" icon={Wallet}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 12 }}>
          <Field label="סכום לתשלום (₪)"><input value={amountDue} onChange={(e) => setAmountDue(e.target.value)} style={inputStyle} inputMode="decimal" /></Field>
          <Field label="שטר/סכום שהתקבל (₪)"><input value={billGiven} onChange={(e) => setBillGiven(e.target.value)} style={inputStyle} inputMode="decimal" /></Field>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: change < 0 ? COLORS.red : COLORS.teal }}>
          עודף להחזרה: {fmtILS(Math.max(0, change))}
        </div>
      </Card>

      <Card title="הפקדת קופה" icon={Wallet}>
        <p style={{ fontSize: 13.5, color: "#3a5250", marginTop: 0 }}>סגירת יום קופה — מסכם ורושם ביומן השינויים את סך המזומן שנאסף היום.</p>
        <button style={btnGold} onClick={depositCash}><FileSpreadsheet size={16} /> רישום הפקדת קופה ({fmtILS(todayCash)})</button>
      </Card>
    </>
  );
}
const roundBtn = { width: 52, height: 52, borderRadius: "50%", border: "none", background: "#fff", boxShadow: "0 1px 4px #00000022", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

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

function KioskMalfunctions({ data, staffName, flash }) {
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("תחזוקה כללית");
  const submit = () => {
    if (!desc.trim()) return;
    data.setMalfunctions((prev) => [{ id: uid(), date: todayStr(), staffName, category, description: desc.trim(), status: "פתוח", ts: new Date().toISOString() }, ...prev]);
    data.addAudit(staffName, "פתיחת קריאת תקלה", `${category}: ${desc.trim().slice(0, 60)}`);
    setDesc("");
    flash("הקריאה נשלחה לאגף התפעול ✓");
  };
  const mine = data.malfunctions.slice(0, 8);
  const statusColor = { "פתוח": COLORS.red, "בטיפול": COLORS.gold, "טופל": COLORS.aqua };

  return (
    <Card title="דיווח תקלות וקריאות שירות" icon={Wrench}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="קטגוריה">
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {["תחזוקה כללית", "אינסטלציה", "חשמל", "ניקיון", "מלאי", "אחר"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="תיאור התקלה">
          <input value={desc} onChange={(e) => setDesc(e.target.value)} style={inputStyle} placeholder="תארי את התקלה בקצרה" />
        </Field>
      </div>
      <button style={btnPrimary} onClick={submit}><Wrench size={16} /> פתיחת קריאה</button>

      <div style={{ marginTop: 20, borderTop: "1px solid #00000012", paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.teal, marginBottom: 10 }}>קריאות אחרונות מהמקווה</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mine.length === 0 && <Empty text="אין קריאות פתוחות." />}
          {mine.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: 11, borderRadius: 10, background: "#fff", border: "1px solid #00000010" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.category} — {m.description}</div>
                <div style={{ fontSize: 11.5, color: "#3a5250" }}>{m.staffName} · {fmtDate(m.date)}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[m.status], alignSelf: "center" }}>{m.status}</span>
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
  const [tab, setTab] = useState(mikvehs.length ? "overview" : "mikvehs");

  useEffect(() => {
    if (!mikvehs.find((m) => m.id === mikvehId) && mikvehs[0]) setMikvehId(mikvehs[0].id);
  }, [mikvehs, mikvehId]);

  const mikveh = mikvehs.find((m) => m.id === mikvehId);
  const data = useSystemData(mikvehId);

  const tabs = [
    { id: "overview", label: "סקירת מקוואות", icon: Building2 },
    { id: "dashboard", label: "דשבורד", icon: TrendingUp },
    { id: "attendance", label: "נוכחות וסידור", icon: CalendarCheck },
    { id: "water", label: "איכות מים", icon: Thermometer },
    { id: "finance", label: "דוחות כספיים", icon: FileSpreadsheet },
    { id: "audit", label: "יומן שינויים", icon: History },
    { id: "tickets", label: "קריאות תפעול", icon: Wrench },
    { id: "mikvehs", label: "ניהול מקוואות", icon: MapPin },
    { id: "permissions", label: "הרשאות", icon: ShieldCheck },
  ];
  const needsMikveh = !["overview", "mikvehs", "permissions"].includes(tab);

  return (
    <div style={{ paddingTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: COLORS.teal }}>מחוברת כ-<b>{authUser.displayName || authUser.email}</b></div>
        <button onClick={() => signOutUser()} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}><LogOut size={13} /> התנתקות</button>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
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

      {tab === "overview" && <AdminOverviewAllMikvehs mikvehs={mikvehs} onSelect={(id) => { setMikvehId(id); setTab("dashboard"); }} />}
      {needsMikveh && !mikveh && <Empty text="אין עדיין מקוואות במערכת — יש להוסיף מקווה בלשונית 'ניהול מקוואות'." />}
      {tab === "dashboard" && mikveh && <AdminDashboard data={data} />}
      {tab === "attendance" && mikveh && <AdminAttendance data={data} />}
      {tab === "water" && mikveh && <AdminWater data={data} />}
      {tab === "finance" && mikveh && <AdminFinance data={data} />}
      {tab === "audit" && mikveh && <AdminAudit data={data} />}
      {tab === "tickets" && mikveh && <AdminTickets data={data} />}
      {tab === "mikvehs" && <AdminMikvehs mikvehsCtl={mikvehsCtl} />}
      {tab === "permissions" && <AdminPermissions adminEmails={adminEmails} setAdminEmails={setAdminEmails} mikvehs={mikvehs} authUser={authUser} />}
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

function AdminOverviewAllMikvehs({ mikvehs, onSelect }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const today = todayStr();
      const results = await Promise.all(mikvehs.map(async (m) => {
        const [checklist, dippers, malfunctions, inventory] = await Promise.all([
          storage.get(`checklist-by-date:${m.id}`).catch(() => null),
          storage.get(`dippers-log:${m.id}`).catch(() => null),
          storage.get(`malfunctions:${m.id}`).catch(() => null),
          storage.get(`inventory:${m.id}`).catch(() => null),
        ]);
        const todayChecklist = checklist ? checklist[today] : null;
        const todayDippers = (dippers || []).filter((d) => d.date === today).reduce((s, d) => s + d.count, 0);
        const openTickets = (malfunctions || []).filter((t) => t.status !== "טופל").length;
        const lowStock = inventory ? Object.values(inventory).filter((i) => i.qty <= i.threshold).length : 0;
        return { mikveh: m, opened: !!(todayChecklist && todayChecklist.opened), closed: !!(todayChecklist && todayChecklist.closed), todayDippers, openTickets, lowStock };
      }));
      if (active) setRows(results);
    })();
    return () => { active = false; };
  }, [mikvehs]);

  if (mikvehs.length === 0) return <Empty text="אין עדיין מקוואות — הוסיפי מקווה בלשונית 'ניהול מקוואות'." />;
  if (rows === null) return <CenteredLoading text="טוענת נתוני מקוואות…" />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
      {rows.map((r) => (
        <button key={r.mikveh.id} onClick={() => onSelect(r.mikveh.id)} style={{
          textAlign: "right", background: COLORS.paper, border: `1px solid ${COLORS.aqua}22`, borderRadius: 16, padding: 18, cursor: "pointer",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div>
              <div className="font-display" style={{ fontWeight: 700, fontSize: 16 }}>{r.mikveh.name}</div>
              <div style={{ fontSize: 12, color: "#7a8f8d" }}>{r.mikveh.address}</div>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 8, background: r.closed ? "#eee" : r.opened ? COLORS.aquaLight : COLORS.redLight, color: r.closed ? "#777" : r.opened ? COLORS.teal : COLORS.red }}>
              {r.closed ? "נסגר" : r.opened ? "פתוח" : "טרם נפתח"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 14, borderTop: "1px solid #00000010" }}>
            <StatMini label="טובלות היום" value={r.todayDippers} />
            <StatMini label="קריאות פתוחות" value={r.openTickets} warn={r.openTickets > 0} />
            <StatMini label="מלאי נמוך" value={r.lowStock} warn={r.lowStock > 0} />
          </div>
        </button>
      ))}
    </div>
  );
}

function AdminMikvehs({ mikvehsCtl }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [copiedId, setCopiedId] = useState("");

  const add = () => {
    if (!name.trim()) return;
    mikvehsCtl.addMikveh(name.trim(), address.trim());
    setName(""); setAddress("");
  };

  const pairingUrl = (m) => `${window.location.origin}${window.location.pathname}#/kiosk-setup/${m.id}/${m.setupToken}`;
  const copy = async (m) => {
    try { await navigator.clipboard.writeText(pairingUrl(m)); setCopiedId(m.id); setTimeout(() => setCopiedId(""), 2000); }
    catch (e) { /* clipboard blocked — link is still selectable text */ }
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

      <Card title="מקוואות ברשת" icon={MapPin}>
        {mikvehsCtl.list.length === 0 && <Empty text="אין עדיין מקוואות." />}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mikvehsCtl.list.map((m) => (
            <div key={m.id} style={{ border: "1px solid #00000012", borderRadius: 13, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
                  <div style={{ fontSize: 12.5, color: "#7a8f8d" }}>{m.address}</div>
                </div>
                <button onClick={() => { if (window.confirm(`למחוק את "${m.name}"? כל הנתונים שלו יישארו מאוחסנים אך לא יוצגו יותר.`)) mikvehsCtl.removeMikveh(m.id); }}
                  style={{ ...btnGhost, padding: "6px 9px", color: COLORS.red, borderColor: COLORS.red + "55" }}><Trash2 size={14} /></button>
              </div>
              <div style={{ marginTop: 12, background: COLORS.seafoam, borderRadius: 11, padding: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Tablet size={13} /> קישור להתקנת טאבלט קבוע במקווה זה</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <code style={{ flex: 1, minWidth: 160, fontSize: 11.5, background: "#fff", padding: "6px 9px", borderRadius: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pairingUrl(m)}</code>
                  <button onClick={() => copy(m)} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11.5 }}><Copy size={12} /> {copiedId === m.id ? "הועתק!" : "העתקה"}</button>
                  <button onClick={() => mikvehsCtl.regenerateToken(m.id)} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11.5 }}><RefreshCw size={12} /> קישור חדש</button>
                </div>
                <div style={{ marginTop: 6, fontSize: 11.5, color: "#7a8f8d" }}>לפתוח את הקישור בדפדפן הטאבלט הפיזי שיישאר קבוע במקווה — פעולה חד-פעמית. "קישור חדש" מבטל קישורים קודמים שהודלפו.</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function AdminPermissions({ adminEmails, setAdminEmails, mikvehs, authUser }) {
  const [kioskEmails, setKioskEmails] = useShared("kiosk-emails", []);

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

  const [newKioskEmail, setNewKioskEmail] = useState("");
  const [newKioskName, setNewKioskName] = useState("");
  const [newKioskMikveh, setNewKioskMikveh] = useState(mikvehs[0]?.id || "");
  const addKiosk = () => {
    if (!newKioskEmail.trim() || !newKioskName.trim() || !newKioskMikveh) return;
    setKioskEmails((prev) => [...prev, { email: newKioskEmail.trim().toLowerCase(), staffName: newKioskName.trim(), mikvehId: newKioskMikveh, addedAt: new Date().toISOString() }]);
    setNewKioskEmail(""); setNewKioskName("");
  };
  const removeKiosk = (idx) => setKioskEmails((prev) => prev.filter((_, i) => i !== idx));

  return (
    <>
      <Card title="מנהלי מערכת — כניסה ל'ניהול ובקרה'" icon={ShieldCheck}>
        <p style={{ fontSize: 13, color: "#3a5250", marginTop: 0 }}>רק כתובות Google ברשימה הזו יוכלו להתחבר לממשק הניהול.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, marginBottom: 16 }}>
          <input placeholder="שם" style={inputStyle} value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} />
          <input placeholder="[email protected]" style={inputStyle} value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} />
          <button style={btnPrimary} onClick={addAdmin}><Plus size={15} /> הוספה</button>
        </div>
        <Table headers={["שם", "אימייל", ""]}
          rows={adminEmails.map((a) => [a.name, a.email, a.email === authUser.email.toLowerCase() ? <span key="me" style={{ fontSize: 11.5, color: "#7a8f8d" }}>את/ה</span> : <button key="x" onClick={() => removeAdmin(a.email)} style={{ ...btnGhost, padding: "4px 8px", fontSize: 11.5, color: COLORS.red }}><Trash2 size={12} /></button>])}
          empty="אין מנהלים מוגדרים." />
      </Card>

      <Card title="בלניות מאושרות — כניסה מהטלפון האישי" icon={Smartphone}>
        <p style={{ fontSize: 13, color: "#3a5250", marginTop: 0 }}>מיפוי בין חשבון Google, שם הבלנית והמקווה שלה. כניסה מטלפון אישי (שאינו טאבלט מותקן) תעבוד רק לכתובות שברשימה זו.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, marginBottom: 16 }}>
          <input placeholder="שם הבלנית" style={inputStyle} value={newKioskName} onChange={(e) => setNewKioskName(e.target.value)} />
          <input placeholder="[email protected]" style={inputStyle} value={newKioskEmail} onChange={(e) => setNewKioskEmail(e.target.value)} />
          <select style={inputStyle} value={newKioskMikveh} onChange={(e) => setNewKioskMikveh(e.target.value)}>
            {mikvehs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button style={btnPrimary} onClick={addKiosk}><Plus size={15} /> הוספה</button>
        </div>
        <Table headers={["בלנית", "אימייל", "מקווה", ""]}
          rows={kioskEmails.map((k, i) => [k.staffName, k.email, (mikvehs.find((m) => m.id === k.mikvehId) || {}).name || "—", <button key="x" onClick={() => removeKiosk(i)} style={{ ...btnGhost, padding: "4px 8px", fontSize: 11.5, color: COLORS.red }}><Trash2 size={12} /></button>])}
          empty="אין בלניות מאושרות לכניסה מהטלפון." />
      </Card>
    </>
  );
}

function StatCard({ label, value, icon: Icon, color = COLORS.teal }) {
  return (
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

function AdminAttendance({ data }) {
  const recent = data.loginLog.slice(0, 15);
  return (
    <Card title="נוכחות וכניסות למשמרת" icon={CalendarCheck}>
      <Table headers={["בלנית", "תאריך", "שעה"]}
        rows={recent.map((l) => [l.staffName, fmtDate(l.ts), fmtDateTime(l.ts).split(" ")[1]])}
        empty="עדיין אין רישומי כניסה — יתעדכן כשבלנית תתחבר בטאבלט." />
    </Card>
  );
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
  const [mikvehId, setMikvehId] = useState(mikvehs[0]?.id || "");
  useEffect(() => {
    if (!mikvehs.find((m) => m.id === mikvehId) && mikvehs[0]) setMikvehId(mikvehs[0].id);
  }, [mikvehs, mikvehId]);
  const mikveh = mikvehs.find((m) => m.id === mikvehId);

  if (mikvehs.length === 0) {
    return <div style={{ paddingTop: 40 }}><Empty text="אין כרגע מקוואות פעילים במערכת." /></div>;
  }

  return (
    <div style={{ paddingTop: 18 }}>
      {mikvehs.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {mikvehs.map((m) => (
            <button key={m.id} onClick={() => setMikvehId(m.id)} style={{
              padding: "9px 16px", borderRadius: 11, border: `1.5px solid ${m.id === mikvehId ? COLORS.teal : "#00000018"}`,
              background: m.id === mikvehId ? COLORS.aquaLight : "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13.5,
            }}>{m.name}</button>
          ))}
        </div>
      )}
      {mikveh && <PublicMikvehDetail mikveh={mikveh} />}
    </div>
  );
}

function PublicMikvehDetail({ mikveh }) {
  const data = useSystemData(mikveh.id);
  const today = todayStr();
  const staffToday = data.loginLog.find((l) => l.ts.slice(0, 10) === today);
  const isOpenDay = OPENING_HOURS[new Date().getDay()].hours !== "סגור";

  return (
    <>
      <div style={{ background: `linear-gradient(135deg, ${COLORS.teal}, ${COLORS.aqua})`, borderRadius: 20, padding: 26, color: "#fff", marginBottom: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.15 }}>
          <WaveDivider color="#fff" opacity={1} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: isOpenDay ? "#8CE0B0" : "#EFA6A0" }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>{isOpenDay ? "פתוח היום" : "סגור היום"}</span>
        </div>
        <h1 className="font-display" style={{ margin: "0 0 6px", fontSize: 26 }}>{mikveh.name} — {OPENING_HOURS[new Date().getDay()].day}</h1>
        <p style={{ margin: 0, opacity: 0.95, fontSize: 15 }}>שעות היום: <b>{OPENING_HOURS[new Date().getDay()].hours}</b>{staffToday && <> · בלנית במשמרת: <b>{staffToday.staffName}</b></>}</p>
        <p style={{ marginTop: 4, opacity: 0.9, fontSize: 13 }}>{mikveh.address}</p>
        <p style={{ marginTop: 8, fontSize: 12.5, opacity: 0.85 }}>שעות השבוע הצמודות לשקיעה/צאת הכוכבים מחושבות אוטומטית באתר הסופי; כאן מוצגות שעות לדוגמה.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
        <div>
          <Card title="שעות פתיחה שבועיות" icon={Clock}>
            <Table headers={["יום", "שעות"]} rows={OPENING_HOURS.map((d) => [d.day, d.hours])} empty="" />
          </Card>
          <Card title="נגישות ומוצרים במקום" icon={Accessibility}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["מעלון נגיש לבעלות מוגבלות", "חדרי הכנה מרווחים", "ערכות בלנית וחומרי טיפוח למכירה", "חניה נגישה בסמוך לכניסה"].map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Check size={16} color={COLORS.aqua} /><span style={{ fontSize: 14 }}>{f}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <PublicBooking data={data} />
      </div>
    </>
  );
}

function PublicBooking({ data }) {
  const [form, setForm] = useState({ name: "", phone: "", date: todayStr(), time: "21:00" });
  const [done, setDone] = useState(false);

  const submit = () => {
    if (!form.name || !form.phone) return;
    data.setAppointments((prev) => [{ id: uid(), ...form, ts: new Date().toISOString() }, ...prev]);
    setDone(true);
    setTimeout(() => setDone(false), 3200);
    setForm({ name: "", phone: "", date: todayStr(), time: "21:00" });
  };

  return (
    <Card title="קביעת תור" icon={CalendarCheck}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="שם מלא"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="טלפון"><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="תאריך"><input type="date" style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="שעה"><input type="time" style={inputStyle} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
        </div>
        <button style={btnPrimary} onClick={submit}><CalendarCheck size={16} /> קביעת תור</button>
        <button style={{ ...btnGhost, justifyContent: "center" }}><PhoneCall size={15} /> מעבר לתשלום באתר המועצה</button>
        {done && <div style={{ background: COLORS.aquaLight, color: COLORS.teal, padding: 11, borderRadius: 10, fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>התור נקבע בהצלחה! ✓</div>}
      </div>
    </Card>
  );
}
