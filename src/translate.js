// תרגום טקסט מעברית לאנגלית, לצורך כפתור "תרגום" על הודעות/דיווחים —
// למשל בממשק איש האחזקה. משתמש ב-MyMemory, API ציבורי וחינמי לתרגום
// (אין צורך במפתח API); אין תלות בשרת משלנו. אם הקריאה נכשלת (רשת,
// הגבלת קצב וכו') — נזרקת שגיאה, והקוד הקורא אחראי להציג הודעה מתאימה
// ולא לשבור את הממשק.
export async function translateToEnglish(text) {
  const q = (text || "").trim();
  if (!q) return "";
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=he|en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`translation request failed (${res.status})`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error("translation response was empty");
  return translated;
}
