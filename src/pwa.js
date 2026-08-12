// לוגיקת "הוספה למסך הבית" (PWA install) — מבוסס על אותו קוד שכבר בשימוש
// באפליקציית "תפילות ושיעורי תורה בבית אל", מותאם למודול ES / React.

// תופס את אירוע ההתקנה של הדפדפן (כשקיים — כרום/אנדרואיד בעיקר) כדי
// שנוכל להפעיל אותו ביוזמתנו כשלוחצים על הכפתור, במקום להסתמך על באנר
// אוטומטי של הדפדפן.
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

export function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isRunningStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function isInAppBrowser() {
  // חלק מהדפדפנים המוטבעים (כמו וואטסאפ) לא תמיד מזוהים באמינות, אבל אלה
  // שכן מזהים את עצמם — נתפוס.
  return /FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent);
}

// רושם את ה-Service Worker (public/sw.js). קוראים לזה פעם אחת בעליית האפליקציה.
export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e) => console.error("SW registration failed", e));
  }
}

// הפעולה שמופעלת בלחיצה על כפתור "הוספה למסך הבית".
export function addToHomeScreen() {
  if (isInAppBrowser()) {
    alert('נראה שאתם בתוך דפדפן מוטבע של אפליקציה אחרת (כמו פייסבוק/אינסטגרם) — התקנה לא זמינה משם.\n\nיש לפתוח את הקישור בדפדפן Chrome (או Safari) עצמו: לחצו על שלוש הנקודות ⋮ למעלה וחפשו "פתח בדפדפן" / "Open in Chrome", או העתיקו את הקישור ופתחו אותו ידנית בדפדפן.');
    return;
  }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => { deferredInstallPrompt = null; });
    return;
  }
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const msg = isIOS
    ? 'ב-Safari: לחצו על כפתור השיתוף (הריבוע עם החץ למעלה) בתחתית המסך, ואז "הוסף למסך הבית".'
    : 'בתפריט הדפדפן (שלוש נקודות למעלה) חפשו "התקן אפליקציה" או "הוסף למסך הבית".\n\nאם מופיעה אזהרת "Google Play Protect" — זה תקין ובטוח, פשוט לחצו "פרטים נוספים" ואז "התקן בכל זאת". זו הודעה גורפת של גוגל שלא קשורה לבעיה באתר עצמו.\n\nאם אתם בתוך אפליקציה אחרת (וואטסאפ, פייסבוק וכו׳) ולא בדפדפן עצמו — חובה לפתוח קודם את הקישור בדפדפן (Chrome) לפני שמנסים להתקין.';
  alert(msg);
}
