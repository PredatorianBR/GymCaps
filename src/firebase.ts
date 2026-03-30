import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBF7W4UXs4NwXuTn_x1Fpkz79f_iAp_vp0",
  authDomain: "gymcaps-1bdf8.firebaseapp.com",
  databaseURL: "https://gymcaps-1bdf8-default-rtdb.firebaseio.com",
  projectId: "gymcaps-1bdf8",
  storageBucket: "gymcaps-1bdf8.firebasestorage.app",
  messagingSenderId: "513634197100",
  appId: "1:513634197100:web:2692598b3ec72fe49c4249",
  measurementId: "G-GLG25KC4RL"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
