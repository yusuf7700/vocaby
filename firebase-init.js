/* ===================== Firebase sozlamalari ===================== */
/* Bu fayl Firebase'ni ishga tushiradi. firebase-*-compat.js skriptlaridan keyin,
   app.js dan oldin yuklanishi kerak (index.html da tartib shunga mos). */

const firebaseConfig = {
  apiKey: "AIzaSyCByg96GlyIusncki1ubxfw-PVNH28BD78",
  authDomain: "vocabyy.firebaseapp.com",
  projectId: "vocabyy",
  storageBucket: "vocabyy.firebasestorage.app",
  messagingSenderId: "313510648383",
  appId: "1:313510648383:web:3bac52bd73c4ab29cd768a",
  measurementId: "G-153KYV82SM"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Offline keshni yoqamiz — internet uzilib qolsa ham ilova ishlayveradi
db.enablePersistence().catch(()=>{ /* bir nechta tab ochiq bo'lsa xato berishi mumkin, muammo emas */ });
