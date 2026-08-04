// Firestore-backed replacement for the window.storage API.
// All data lives in one Firestore collection ("app_data") where each
// document's ID is the storage key and its "value" field holds the
// (already-parsed) JSON payload. This mirrors the shared, key/value
// storage the app was originally written against, so App.jsx barely
// had to change.
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, query, where, orderBy, documentId,
} from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COLLECTION = "app_data";

export const storage = {
  async get(key) {
    const snap = await getDoc(doc(db, COLLECTION, key));
    if (!snap.exists()) return null;
    return snap.data().value;
  },

  async set(key, value) {
    await setDoc(doc(db, COLLECTION, key), {
      value,
      updatedAt: new Date().toISOString(),
    });
    return { key, value };
  },

  async delete(key) {
    await deleteDoc(doc(db, COLLECTION, key));
    return { key, deleted: true };
  },

  async list(prefix = "") {
    const col = collection(db, COLLECTION);
    const q = prefix
      ? query(col, where(documentId(), ">=", prefix), where(documentId(), "<", prefix + "\uf8ff"))
      : query(col);
    const snap = await getDocs(q);
    return { keys: snap.docs.map((d) => d.id) };
  },
};
