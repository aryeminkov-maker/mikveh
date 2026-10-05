// שמירת תמונות שמצורפות לדיווח תקלה.
// Firebase Storage דורש מאז פברואר 2026 מעבר לתוכנית Blaze (כרטיס אשראי),
// לכן התמונות נשמרות כאן ב-Firestore — שירות שכבר בשימוש באפליקציה ונשאר
// בחינם. כל תמונה נשמרת במסמך נפרד (מפתח "malfunction-photo:..."), אחרי
// כיווץ חזק בדפדפן (עד 800px, JPEG) כך שהיא תופסת בערך 50-150KB — הרבה
// מתחת למגבלת 1MB למסמך.
import { storage } from "./storage";

const MAX_CHARS = 700000; // תקרת בטיחות לגודל מחרוזת ה-base64 (מגבלת מסמך: ~1MB)

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// מכווץ תמונה ל-data URL של JPEG. אם התוצאה עדיין גדולה מדי — מקטין איכות/רוחב.
async function compressToDataUrl(file) {
  const img = await loadImage(file);
  let width = 800, quality = 0.65;
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, width / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_CHARS) return dataUrl;
    width = Math.round(width * 0.75);
    quality = Math.max(0.4, quality - 0.1);
  }
  throw new Error("התמונה גדולה מדי גם אחרי כיווץ");
}

// מכווץ ושומר תמונה לדיווח תקלה, ומחזיר את המפתח (photoKey) שנשמר ברשומת התקלה.
export async function uploadMalfunctionPhoto(mikvehId, file) {
  const dataUrl = await compressToDataUrl(file);
  const key = `malfunction-photo:${mikvehId}:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await storage.set(key, dataUrl);
  return key;
}

// טוען תמונה שנשמרה (לפי המפתח) — מחזיר data URL, או null אם לא נמצאה.
export async function loadMalfunctionPhoto(key) {
  return storage.get(key);
}

// מוחק תמונה שנשמרה (ניסיון בלבד — כשל לא חוסם כלום).
export async function deleteMalfunctionPhoto(key) {
  try { await storage.delete(key); } catch (e) { /* ignore */ }
}
