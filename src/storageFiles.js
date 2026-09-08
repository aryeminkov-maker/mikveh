// העלאת תמונות ל-Firebase Storage (למשל, תמונה שמצורפת לדיווח תקלה).
// דורש שהמנהל יפעיל "Storage" בקונסולת Firebase (ראו הוראות שנמסרו בנפרד).
import { initializeApp, getApps } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseConfig } from "./firebaseConfig";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const storage = getStorage(app);

// מכווץ תמונה בדפדפן לפני ההעלאה (רוחב מקסימלי 1000px, JPEG באיכות 0.75)
// כדי לשמור על נפח קובץ קטן ועל עלויות אחסון/העברה נמוכות.
function resizeImage(file, maxWidth = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("כשל בדחיסת התמונה"))), "image/jpeg", quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// מכווץ ומעלה תמונה שמצורפת לדיווח תקלה עבור מקווה נתון, ומחזירה את כתובת
// ה-URL הציבורית שלה (זה מה שנשמר בפועל ברשומת התקלה ב-Firestore).
export async function uploadMalfunctionPhoto(mikvehId, file) {
  const blob = await resizeImage(file);
  const path = `malfunction-photos/${mikvehId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(fileRef);
}
