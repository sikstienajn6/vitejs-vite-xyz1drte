import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBxmZXjDUpeOUPWFD_Bg-dOP4J4_F3R1rE",
  authDomain: "weighttracker-b4b79.firebaseapp.com",
  projectId: "weighttracker-b4b79",
  storageBucket: "weighttracker-b4b79.firebasestorage.app",
  messagingSenderId: "895893600072",
  appId: "1:895893600072:web:e329aba69602d46fa8e57d",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
