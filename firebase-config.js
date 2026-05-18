import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAsr40ldkZ4-3Iyi-Aqa4UHUwHVS5iWr8c",
    authDomain: "pool-tracker-50497.firebaseapp.com",
    projectId: "pool-tracker-50497",
    storageBucket: "pool-tracker-50497.appspot.com",
    messagingSenderId: "142826908166",
    appId: "1:142826908166:web:05a791bf3cda8fd0ae3187"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
