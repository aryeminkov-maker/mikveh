// חישוב זמנים הלכתיים (שקיעה, צאת הכוכבים) וזיהוי חגים בלוח העברי.
// מבוסס על אותה ספרייה ואותה שיטת חישוב שכבר בשימוש באפליקציית
// "תפילות ושיעורי תורה בבית אל" — כולל אותה הגנה: אם הספרייה לא נטענה
// בהצלחה, או שיש חוסר התאמה בממשק שלה, נופלים בבטחה לנוסחה ידנית
// (ללא התאמת גובה) כדי שהאפליקציה לעולם לא תישבר.

// קואורדינטות בית אל
export const LAT = 31.9333;
export const LON = 35.2167;
export const ELEVATION_METERS = 880; // גובה בית אל מעל פני הים

// ---------- נוסחת גיבוי ידנית (US Naval Observatory, ללא התאמת גובה) ----------
function sunTimeUTCHours(date, lat, lon, zenith, rising) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const N1 = Math.floor(275 * (date.getMonth() + 1) / 9);
  const N2 = Math.floor((date.getMonth() + 1 + 9) / 12);
  const N3 = 1 + Math.floor((date.getFullYear() - 4 * Math.floor(date.getFullYear() / 4) + 2) / 3);
  const N = N1 - (N2 * N3) + date.getDate() - 30;
  const lngHour = lon / 15;
  const t = rising ? N + ((6 - lngHour) / 24) : N + ((18 - lngHour) / 24);
  const M = (0.9856 * t) - 3.289;
  let L = M + (1.916 * Math.sin(rad * M)) + (0.020 * Math.sin(2 * rad * M)) + 282.634;
  L = ((L % 360) + 360) % 360;
  let RA = deg * Math.atan(0.91764 * Math.tan(rad * L));
  RA = ((RA % 360) + 360) % 360;
  const Lq = Math.floor(L / 90) * 90, RAq = Math.floor(RA / 90) * 90;
  RA = (RA + (Lq - RAq)) / 15;
  const sinDec = 0.39782 * Math.sin(rad * L);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad * zenith) - (sinDec * Math.sin(rad * lat))) / (cosDec * Math.cos(rad * lat));
  if (cosH > 1 || cosH < -1) return null;
  let H = rising ? 360 - deg * Math.acos(cosH) : deg * Math.acos(cosH);
  H = H / 15;
  const T = H + RA - (0.06571 * t) - 6.622;
  let UT = ((T - lngHour) % 24 + 24) % 24;
  return UT;
}
function utHoursToDate(baseDate, utHours) {
  if (utHours === null) return null;
  const h = Math.floor(utHours), m = Math.round((utHours - h) * 60);
  return new Date(Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), h, m));
}
function getZmanimLegacyFormula(date) {
  const sunrise = utHoursToDate(date, sunTimeUTCHours(date, LAT, LON, 90.833, true));
  const sunset = utHoursToDate(date, sunTimeUTCHours(date, LAT, LON, 90.833, false));
  const tzeit = utHoursToDate(date, sunTimeUTCHours(date, LAT, LON, 98.5, false));
  return { sunrise, sunset, tzeit };
}

// ---------- זיהוי ספריית Hebcal הגלובלית (נטענת מ-CDN ב-index.html) ----------
let _hebcalGlobal; // undefined = עוד לא נבדק; null = לא נמצא; אחרת - האובייקט עצמו
function getHebcalGlobal() {
  if (_hebcalGlobal !== undefined) return _hebcalGlobal;
  const candidates = [window.hebcal, window.Hebcal, window.HebcalCore];
  _hebcalGlobal = candidates.find((c) => c && c.GeoLocation && c.Zmanim && c.HDate) || null;
  if (!_hebcalGlobal) console.warn("ספריית Hebcal לא זוהתה — משתמשים בנוסחת הגיבוי לחישוב זמנים, ובלי זיהוי חגים/ראש חודש.");
  return _hebcalGlobal;
}

// מחזיר { sunrise, sunset, tzeit } כאובייקטי Date, ל-date נתון
export function getZmanim(date) {
  const hebcal = getHebcalGlobal();
  if (hebcal) {
    try {
      const gloc = new hebcal.GeoLocation(null, LAT, LON, ELEVATION_METERS, "Asia/Jerusalem");
      const z = new hebcal.Zmanim(gloc, date, true);
      const sunrise = typeof z.sunrise === "function" ? z.sunrise() : (typeof z.getSunrise === "function" ? z.getSunrise() : null);
      const sunset = typeof z.sunset === "function" ? z.sunset() : (typeof z.getSunset === "function" ? z.getSunset() : null);
      let tzeit = null;
      if (typeof z.tzeit === "function") tzeit = z.tzeit(8.5);
      else if (typeof z.tzais === "function") tzeit = z.tzais(8.5);
      if (!sunrise || !sunset || !tzeit) throw new Error("לא כל הזמנים חושבו — כנראה חוסר התאמה בממשק הספרייה");
      return { sunrise: new Date(sunrise), sunset: new Date(sunset), tzeit: new Date(tzeit) };
    } catch (e) {
      console.error("שגיאה בחישוב זמנים דרך Hebcal — חוזרים לנוסחת הגיבוי הישנה עבור הקריאה הזו", e);
    }
  }
  return getZmanimLegacyFormula(date);
}

// ---------- זיהוי יום מיוחד בלוח העברי (ראש חודש / חול המועד / ערב חג / חג) ----------
export function getSpecialDayInfo(date) {
  const hebcal = getHebcalGlobal();
  if (!hebcal) return null;
  try {
    const hd = new hebcal.HDate(date);
    const isRoshChodesh = typeof hd.isRoshChodesh === "function" && hd.isRoshChodesh();
    const events = (hebcal.HebrewCalendar && typeof hebcal.HebrewCalendar.getHolidaysOnDate === "function")
      ? (hebcal.HebrewCalendar.getHolidaysOnDate(hd, true) || []) : [];
    const F = hebcal.flags || {};
    let isChag = false, isErev = false, isCholHamoed = false, holidayName = "";
    events.forEach((ev) => {
      const flags = typeof ev.getFlags === "function" ? ev.getFlags() : 0;
      const name = typeof ev.render === "function" ? ev.render("he") : (typeof ev.basename === "function" ? ev.basename() : "");
      if (F.CHOL_HAMOED && (flags & F.CHOL_HAMOED)) { isCholHamoed = true; holidayName = name; }
      else if (F.EREV && (flags & F.EREV)) { isErev = true; holidayName = name; }
      else if (F.CHAG && (flags & F.CHAG)) { isChag = true; holidayName = name; }
    });
    if (isCholHamoed) return { kind: "cholHamoed", label: "חול המועד", holidayName };
    if (isErev) return { kind: "erevChag", label: "ערב חג", holidayName };
    if (isChag) return { kind: "chag", label: "חג", holidayName };
    if (isRoshChodesh) {
      const monthName = typeof hd.getMonthName === "function" ? hd.getMonthName("he") : "";
      return { kind: "roshChodesh", label: "ראש חודש" + (monthName ? " " + monthName : ""), holidayName: monthName };
    }
    return null;
  } catch (e) {
    console.error("שגיאה בזיהוי יום מיוחד בלוח העברי", e);
    return null;
  }
}

// מעצב אובייקט Date לשעה מקומית בישראל בפורמט HH:MM
export function formatHM(date) {
  return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
}
