import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged,
} from "firebase/auth";
import { firebaseConfig } from "./firebaseConfig";

// storage.js also calls initializeApp with the same config — Firebase allows
// calling it more than once as long as we reuse the existing app instance.
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

// Public visitors and installed kiosk tablets never go through Google
// sign-in, but Firestore's security rules still require *some* signed-in
// user (see firestore.rules). An anonymous session satisfies that without
// asking residents or tablets for an account.
export async function ensureAnonymousAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

export async function signOutUser() {
  await signOut(auth);
}

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
