/* ============================================================
   الخطة الأسبوعية للطالب — الملف البرمجي الرئيسي
   يعتمد على LocalStorage للحفظ الدائم داخل المتصفح، ويحفظ خطة
   منفصلة لكل (صف + شعبة + عام أكاديمي + أسبوع) بحيث تظهر لكل صف
   خطته الخاصة تلقائياً عند اختياره.
   لربط الحفظ السحابي الحقيقي بين عدة معلمين وأجهزة مختلفة
   (بحيث يستطيع أكثر من معلم الكتابة في نفس الخطة من أي جهاز)
   راجع القسم المخصص أسفل هذا الملف: «نقطة ربط الحفظ السحابي».
   ============================================================ */

/* ------------------------------------------------------------
   1) البيانات الثابتة: الأيام والمواد الدراسية
   ------------------------------------------------------------ */
const SCHOOL_NAME = "مدرسة السلف الصالح الخاصة"; // اسم المدرسة ثابت ولا يمكن تعديله من الواجهة

const WEEK_DAYS = [
  { key: "mon", name: "الإثنين",  icon: "1" },
  { key: "tue", name: "الثلاثاء", icon: "2" },
  { key: "wed", name: "الأربعاء", icon: "3" },
  { key: "thu", name: "الخميس",   icon: "4" },
  { key: "fri", name: "الجمعة",   icon: "5" },
];
// إن كان أسبوعك الدراسي (الإثنين - الجمعة) بدّل المصفوفة أعلاه بهذه:
// const WEEK_DAYS = [
//   { key: "mon", name: "الإثنين",  icon: "1" },
//   { key: "tue", name: "الثلاثاء", icon: "2" },
//   { key: "wed", name: "الأربعاء", icon: "3" },
//   { key: "thu", name: "الخميس",   icon: "4" },
//   { key: "fri", name: "الجمعة",   icon: "5" },
// ];

const SUBJECTS = [
  { key: "islamic",   name: "التربية الإسلامية", icon: "🕌" },
  { key: "arabic",    name: "اللغة العربية",     icon: "📗" },
  { key: "english",   name: "اللغة الإنجليزية",  icon: "🔤" },
  { key: "math",      name: "الرياضيات",         icon: "➗" },
  { key: "science",   name: "العلوم",            icon: "🔬" },
  { key: "physics",   name: "الفيزياء",          icon: "⚛️" },
  { key: "chemistry", name: "الكيمياء",          icon: "🧪" },
  { key: "biology",   name: "الأحياء",           icon: "🧬" },
  { key: "social",    name: "الاجتماعيات",       icon: "🌍" },
];

/* ------------------------------------------------------------
   2) إعدادات Firebase — هذا التطبيق يعتمد على Firestore فقط
   كمصدر وحيد للحفظ والاسترجاع (لا LocalStorage ولا SessionStorage
   إطلاقاً)، بحيث تتصرف الخطة كسجل حقيقي في قاعدة بيانات: المفتاح
   الأساسي (العام الأكاديمي + الأسبوع + الصف + الشعبة) يُحدَّث إذا
   كان موجوداً، أو يُنشأ إذا لم يكن موجوداً — أبداً لا يتكرر.

   ⚠️ الإعداد إلزامي لعمل الحفظ/الاسترجاع: بدونه، سيُظهر البرنامج
   تنبيهاً واضحاً ولن يحفظ أو يسترجع أي شيء (بدل الاعتماد الصامت
   على متصفح كل جهاز، وهو بالضبط ما كان يسبب المشكلة سابقاً).

   خطوات التفعيل (٥ دقائق، مجاني بالكامل):
   1. افتح https://console.firebase.google.com وأنشئ مشروعاً جديداً.
   2. من القائمة الجانبية: Build → Firestore Database → Create database
      (اختر Start in test mode للبدء السريع).
   3. من ⚙️ Project settings → أضف تطبيق ويب (</>) وانسخ بيانات الإعداد.
   4. الصق القيم في الكائن أدناه بدلاً من الفراغات، واحفظ الملف.
   ------------------------------------------------------------ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBxIuUbbJfAE23lzeXjOFUcy135rXpsHnQ",
  authDomain: "weekly-plan-cfbef.firebaseapp.com",
  projectId: "weekly-plan-cfbef",
  storageBucket: "weekly-plan-cfbef.firebasestorage.app",
  messagingSenderId: "578063324097",
  appId: "1:578063324097:web:20cb23c5aa817375a11540",
};

let firestoreDB = null; // تبقى null ما لم يُفعَّل Firebase أعلاه
let isDbConnected = false;

function initFirebaseIfConfigured() {
  if (!FIREBASE_CONFIG.apiKey || typeof firebase === "undefined") {
    isDbConnected = false;
    showDbSetupBanner();
    return;
  }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    firestoreDB = firebase.firestore();
    isDbConnected = true;
    hideDbSetupBanner();
  } catch (e) {
    console.error("تعذّر تفعيل Firebase:", e);
    isDbConnected = false;
    showDbSetupBanner();
  }
}

function showDbSetupBanner() {
  const el = document.getElementById("dbSetupBanner");
  if (el) el.classList.remove("hidden");
  flashSaveStatus("🔴 غير متصل بقاعدة البيانات");
}

function hideDbSetupBanner() {
  const el = document.getElementById("dbSetupBanner");
  if (el) el.classList.add("hidden");
  flashSaveStatus("🟢 متصل بقاعدة البيانات");
}

/* ------------------------------------------------------------
   3) الحالة الحالية للتطبيق (State)
   ------------------------------------------------------------ */
let state = createEmptyState();
let isReadOnly = false;
let isLocked = false;
let autosaveTimer = null;
let suppressContextReload = false; // لمنع إعادة التحميل أثناء تطبيق حالة على الواجهة برمجياً

function createEmptyState() {
  const s = {
    academicYear: "",
    schoolName: SCHOOL_NAME, // ثابت دائماً
    grade: "",
    section: "",
    homeroom: "",
    studentName: "",
    weekNumber: 1,
    weekInput: "",
    logo: "",
    parentNotes: "",
    days: {},
  };
  WEEK_DAYS.forEach((d) => {
    s.days[d.key] = {};
    SUBJECTS.forEach((sub) => {
      s.days[d.key][sub.key] = { lesson: "", hw: "", exam: "" };
    });
  });
  return s;
}

/* ------------------------------------------------------------
   4) بناء جدول الأسبوع: الأيام صفوف رأسية على اليمين،
      والمواد أعمدة أفقية في الأعلى. كل خلية تحتوي على:
      الدرس، ثم الواجب، ثم الاختبار.
   ------------------------------------------------------------ */
function buildGrid() {
  const wrap = document.getElementById("weekGrid");
  wrap.innerHTML = "";

  const table = document.createElement("div");
  table.className = "week-table";
  table.style.gridTemplateColumns = `130px repeat(${SUBJECTS.length}, minmax(190px, 1fr))`;

  // الخلية الزاوية العلوية اليمنى
  const corner = document.createElement("div");
  corner.className = "table-corner";
  corner.innerHTML = `<span>📅</span><span>اليوم / المادة</span>`;
  table.appendChild(corner);

  // رأس الأعمدة: أسماء المواد (أفقياً)
  SUBJECTS.forEach((sub) => {
    const head = document.createElement("div");
    head.className = "subject-head-cell";
    head.innerHTML = `<span class="s-icon">${sub.icon}</span><span>${sub.name}</span>`;
    table.appendChild(head);
  });

  // صفوف الأيام (رأسياً على اليمين) وخلايا المواد أمام كل يوم
  WEEK_DAYS.forEach((day) => {
    const label = document.createElement("div");
    label.className = "day-row-label";
    label.innerHTML = `<span class="d-num">${day.icon}</span><span>${day.name}</span>`;
    table.appendChild(label);

    SUBJECTS.forEach((sub) => {
      const cell = document.createElement("div");
      cell.className = "table-cell";
      cell.innerHTML = `
        <div class="lesson-box">
          <div class="mini-label">📘 الدرس</div>
          <input type="text" data-day="${day.key}" data-subject="${sub.key}" data-type="lesson"
            placeholder="عنوان الدرس">
        </div>
        <div class="mini-box hw-box">
          <div class="mini-label">🟢 الواجب</div>
          <textarea data-day="${day.key}" data-subject="${sub.key}" data-type="hw"
            placeholder="اكتب الواجب..."></textarea>
        </div>
        <div class="mini-box exam-box">
          <div class="mini-label">🔴 الاختبار</div>
          <textarea data-day="${day.key}" data-subject="${sub.key}" data-type="exam"
            placeholder="اكتب الاختبار..."></textarea>
        </div>`;
      table.appendChild(cell);
    });
  });

  wrap.appendChild(table);

  // ربط أحداث الكتابة بكل الحقول (حفظ تلقائي + تحديث العدادات)
  table.querySelectorAll("[data-type]").forEach((field) => {
    field.addEventListener("input", () => {
      const { day, subject, type } = field.dataset;
      state.days[day][subject][type] = field.value;
      updateCounters();
      scheduleAutosave();
    });
  });
}

/* ------------------------------------------------------------
   5) ربط حقول الرأس (بيانات المدرسة) بالحالة
   ------------------------------------------------------------ */
function bindHeaderInputs() {
  const map = {
    academicYear: "academicYear",
    grade: "grade",
    section: "section",
    homeroom: "homeroom",
    studentName: "studentName",
    weekNumber: "weekNumber",
  };
  Object.entries(map).forEach(([id, field]) => {
    const el = document.getElementById(id);
    const isSelect = el.tagName === "SELECT";
    el.addEventListener(isSelect ? "change" : "input", () => {
      state[field] = field === "weekNumber" ? Number(el.value || 1) : el.value;
      if (field === "weekNumber") updateRibbon();
      scheduleAutosave();
      // القوائم المنسدلة (الصف/الشعبة) تحمّل خطة الصف فوراً بعد التحديث أعلاه
      if (isSelect) handleContextChange();
    });
  });

  // حقول العام الأكاديمي ورقم الأسبوع نصية/رقمية: نحمّل الخطة المطابقة
  // فقط بعد أن ينتهي المعلم من الكتابة فيها (عند الخروج من الحقل)
  ["academicYear", "weekNumber"].forEach((id) => {
    document.getElementById(id).addEventListener("change", handleContextChange);
  });

  document.getElementById("weekInput").addEventListener("change", (e) => {
    state.weekInput = e.target.value;
    scheduleAutosave();
  });

  document.getElementById("parentNotes").addEventListener("input", (e) => {
    state.parentNotes = e.target.value;
    scheduleAutosave();
  });

  // شعار المدرسة
  document.getElementById("logoInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.logo = reader.result;
      applyLogo();
      scheduleAutosave();
    };
    reader.readAsDataURL(file);
  });

  // زر الاسترجاع الصريح
  document.getElementById("btnRetrievePlan").addEventListener("click", retrievePlanExplicitly);
}

async function handleContextChange() {
  if (suppressContextReload || isReadOnly) return;
  if (!state.grade || !state.section) {
    // ننتظر اختيار الصف والشعبة معاً قبل محاولة استرجاع أي خطة
    return;
  }
  const id = getCurrentPlanId();
  try {
    const existing = await getPlanById(id);
    if (existing) {
      const currentGrade = state.grade, currentSection = state.section;
      state = mergeWithEmptyState(existing);
      applyStateToUI();
      flashSaveStatus(`✅ تم استرجاع خطة (${currentGrade} - ${currentSection}) المحفوظة`);
    } else {
      resetGridKeepingHeader();
      flashSaveStatus(`🆕 لا توجد خطة محفوظة لـ(${state.grade} - ${state.section})، ابدأ خطة جديدة`);
    }
  } catch (e) {
    // خطأ اتصال حقيقي بقاعدة البيانات — لا نُفرغ الجدول أبداً في هذه الحالة،
    // بل نُنبّه بوضوح حتى لا يُظنّ أن لا توجد خطة محفوظة أصلاً
    showDbSetupBanner();
    flashSaveStatus("🔴 تعذّر الاتصال بقاعدة البيانات — لم يتم الاسترجاع");
    alert(
      "⚠️ تعذّر الاتصال بقاعدة البيانات، فلن يتم عرض أي بيانات تجنباً لعرض نموذج فارغ خاطئ.\nتحقق من إعداد Firebase في script.js (FIREBASE_CONFIG) أو من اتصالك بالإنترنت، ثم أعد المحاولة."
    );
  }
}

// استرجاع صريح يستدعيه زر "🔄 استرجاع الخطة المحفوظة" — نفس منطق التحميل
// التلقائي، لكن مع رسالة تأكيد واضحة للمعلم عند كل ضغطة، ويعمل حتى لو
// لم يتغيّر الصف/الشعبة (مفيد لتحديث آخر ما كتبه معلم آخر على نفس الخطة).
async function retrievePlanExplicitly() {
  if (isReadOnly) return;
  if (!state.grade || !state.section) {
    alert("يرجى اختيار الصف والشعبة أولاً.");
    return;
  }
  const id = getCurrentPlanId();
  try {
    const existing = await getPlanById(id);
    if (existing) {
      state = mergeWithEmptyState(existing);
      applyStateToUI();
      flashSaveStatus(`✅ تم استرجاع خطة (${state.grade} - ${state.section})`);
      alert(`✅ تم استرجاع خطة (${state.grade} - ${state.section}) للأسبوع ${state.weekNumber}.\nيمكنك الآن تحديثها أو الإضافة عليها ثم حفظها.`);
    } else {
      alert(`لا توجد خطة محفوظة بعد لـ(${state.grade} - ${state.section}) في الأسبوع ${state.weekNumber}.\nيمكنك البدء بالكتابة مباشرة.`);
    }
  } catch (e) {
    showDbSetupBanner();
    alert(
      "⚠️ تعذّر الاتصال بقاعدة البيانات، فلم يتم استرجاع أي شيء.\nتحقق من إعداد Firebase في script.js أو من اتصالك بالإنترنت."
    );
  }
}

// إعادة تعيين خلايا الجدول وملاحظات ولي الأمر فقط، مع الإبقاء على بيانات الرأس الحالية
function resetGridKeepingHeader() {
  const header = {
    academicYear: state.academicYear,
    schoolName: state.schoolName,
    grade: state.grade,
    section: state.section,
    homeroom: state.homeroom,
    studentName: state.studentName,
    weekNumber: state.weekNumber,
    weekInput: state.weekInput,
    logo: state.logo,
  };
  state = createEmptyState();
  Object.assign(state, header);
  applyStateToUI();
}

function updateRibbon() {
  document.getElementById("ribbonText").textContent = `أسبوع ${state.weekNumber || 1}`;
}

function applyLogo() {
  const img = document.getElementById("logoImg");
  const placeholder = document.getElementById("logoPlaceholder");
  const printImg = document.getElementById("logoImgPrint");
  if (state.logo) {
    img.src = state.logo;
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
    printImg.src = state.logo;
  } else {
    img.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

/* ------------------------------------------------------------
   6) تجميع/تطبيق الحالة من وإلى واجهة المستخدم
   ------------------------------------------------------------ */
function applyStateToUI() {
  suppressContextReload = true; // لا نريد إعادة تحميل الخطة أثناء ملء الحقول برمجياً

  document.getElementById("academicYear").value = state.academicYear || "";
  document.getElementById("grade").value = state.grade || "";
  document.getElementById("section").value = state.section || "";
  document.getElementById("homeroom").value = state.homeroom || "";
  document.getElementById("studentName").value = state.studentName || "";
  document.getElementById("weekNumber").value = state.weekNumber || 1;
  document.getElementById("weekInput").value = state.weekInput || "";
  document.getElementById("parentNotes").value = state.parentNotes || "";

  document.querySelectorAll("#weekGrid [data-type]").forEach((field) => {
    const { day, subject, type } = field.dataset;
    field.value = (state.days[day] && state.days[day][subject]) ? state.days[day][subject][type] || "" : "";
  });

  updateRibbon();
  applyLogo();
  updateCounters();
  lockAllFields(isLocked);

  suppressContextReload = false;
}

/* ------------------------------------------------------------
   7) العدادات: عدد الدروس/الواجبات/الاختبارات المكتوبة بالأسبوع
   ------------------------------------------------------------ */
function updateCounters() {
  let lesson = 0, hw = 0, exam = 0;
  WEEK_DAYS.forEach((d) => {
    SUBJECTS.forEach((s) => {
      const entry = state.days[d.key][s.key];
      if (entry.lesson && entry.lesson.trim()) lesson++;
      if (entry.hw && entry.hw.trim()) hw++;
      if (entry.exam && entry.exam.trim()) exam++;
    });
  });
  document.getElementById("lessonCount").textContent = lesson;
  document.getElementById("hwCount").textContent = hw;
  document.getElementById("examCount").textContent = exam;
}

/* ------------------------------------------------------------
   8) الحفظ والاسترجاع — Firestore فقط، بلا أي تخزين في المتصفح.
   المفتاح الأساسي لكل خطة: العام الأكاديمي + الأسبوع + الصف +
   الشعبة. عند الحفظ: SELECT فإن وُجد السجل يتم UPDATE، وإلا
   يتم INSERT (سجل واحد فقط لكل مفتاح، أبداً لا يتكرر).
   ------------------------------------------------------------ */
// تنظيف أي جزء من المفتاح من مسافات أو شرطات مائلة أو رموز قد تُفشل
// الحفظ (سواء في Firestore أو في أي نظام تخزين آخر يمنع هذه الرموز)
function sanitizeKeyPart(value) {
  return (value || "").toString().trim().replace(/[\s\/\\#\[\]."']+/g, "-");
}

function getCurrentPlanId() {
  const year = sanitizeKeyPart(state.academicYear || "بدون-عام");
  const grade = sanitizeKeyPart(state.grade || "بدون-صف");
  const section = sanitizeKeyPart(state.section || "بدون-شعبة");
  // ترتيب المفتاح: العام الأكاديمي، الأسبوع، الصف، الشعبة — بحيث تكون
  // لكل صف وشعبة (ولكل أسبوع) خطة مستقلة تماماً عن غيرها
  return `${year}__W${state.weekNumber || 1}__${grade}__${section}`;
}

// SELECT: قراءة خطة بمفتاحها الأساسي من قاعدة البيانات مباشرة.
// يرمي استثناءً عند عدم الاتصال أو فشل الشبكة (لتمييزه عن "لا توجد خطة")
async function getPlanById(id) {
  if (!isDbConnected) {
    throw new Error("DB_NOT_CONNECTED");
  }
  const doc = await firestoreDB.collection("weeklyPlans").doc(id).get();
  return doc.exists ? doc.data().plan : null;
}

// SELECT ثم UPDATE أو INSERT حسب وجود السجل — لا يوجد أي احتمال لتكرار السجل
async function savePlan(showStatus = true) {
  if (!isDbConnected) {
    showDbSetupBanner();
    if (showStatus) {
      alert(
        "⚠️ لم يتم ربط قاعدة البيانات بعد.\nافتح script.js وأضف بيانات مشروع Firebase الخاص بك في FIREBASE_CONFIG (راجع التعليمات أعلى الملف)، ثم أعد تحميل الصفحة."
      );
    }
    return;
  }

  const id = getCurrentPlanId();
  const docRef = firestoreDB.collection("weeklyPlans").doc(id);

  try {
    const existing = await docRef.get(); // SELECT: هل السجل موجود؟
    if (existing.exists) {
      // UPDATE: تحديث نفس السجل، بدون إنشاء أي سجل جديد
      await docRef.update({ plan: state, updatedAt: Date.now() });
      if (showStatus) flashSaveStatus("✅ تم تحديث الخطة المحفوظة");
    } else {
      // INSERT: إنشاء سجل جديد فقط عند عدم وجوده مسبقاً
      await docRef.set({ plan: state, createdAt: Date.now(), updatedAt: Date.now() });
      if (showStatus) flashSaveStatus("✅ تم إنشاء الخطة وحفظها");
    }
  } catch (e) {
    console.error("تعذّر الحفظ في قاعدة البيانات:", e);
    flashSaveStatus("⚠️ تعذّر الحفظ، تحقق من الاتصال بالإنترنت");
  }
}

function scheduleAutosave() {
  if (!isDbConnected) {
    showDbSetupBanner();
    return;
  }
  flashSaveStatus("... جارٍ الحفظ في قاعدة البيانات");
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    await savePlan(false);
  }, 800);
}

function flashSaveStatus(text) {
  document.getElementById("saveStatus").textContent = text;
}

// دمج بيانات محفوظة قديمة مع القالب الفارغ الحالي (لتفادي أخطاء إن أُضيفت مادة جديدة لاحقاً)
function mergeWithEmptyState(saved) {
  const base = createEmptyState();
  const merged = { ...base, ...saved };
  merged.schoolName = SCHOOL_NAME; // اسم المدرسة ثابت دائماً مهما كانت البيانات المحفوظة
  merged.days = base.days;
  WEEK_DAYS.forEach((d) => {
    SUBJECTS.forEach((s) => {
      if (saved.days && saved.days[d.key] && saved.days[d.key][s.key]) {
        merged.days[d.key][s.key] = {
          lesson: saved.days[d.key][s.key].lesson || "",
          hw: saved.days[d.key][s.key].hw || "",
          exam: saved.days[d.key][s.key].exam || "",
        };
      }
    });
  });
  return merged;
}

/* ------------------------------------------------------------
   9) نسخ خطة الأسبوع السابق
   ------------------------------------------------------------ */
async function copyPreviousWeek() {
  const year = sanitizeKeyPart(state.academicYear || "بدون-عام");
  const grade = sanitizeKeyPart(state.grade || "بدون-صف");
  const section = sanitizeKeyPart(state.section || "بدون-شعبة");
  const prevId = `${year}__W${(state.weekNumber || 1) - 1}__${grade}__${section}`;
  let prev;
  try {
    prev = await getPlanById(prevId);
  } catch (e) {
    showDbSetupBanner();
    alert("⚠️ تعذّر الاتصال بقاعدة البيانات، تحقق من إعداد Firebase أو اتصالك بالإنترنت.");
    return;
  }
  if (!prev) {
    alert("لا توجد خطة محفوظة للأسبوع السابق بنفس الصف والشعبة والعام الأكاديمي.");
    return;
  }
  const keepWeekNumber = state.weekNumber;
  const keepWeekInput = state.weekInput;
  state = mergeWithEmptyState(prev);
  state.weekNumber = keepWeekNumber;
  state.weekInput = keepWeekInput;
  applyStateToUI();
  scheduleAutosave();
  alert("✅ تم نسخ محتوى الأسبوع السابق بنجاح، يمكنك الآن تعديله.");
}

/* ------------------------------------------------------------
   10) مسح الخطة بالكامل للانتقال لأسبوع جديد
   يفرّغ الجدول وملاحظات ولي الأمر، ويرفع رقم الأسبوع تلقائياً
   بمقدار واحد، مع الإبقاء على بيانات المدرسة والصف كما هي،
   تمهيداً لكتابة خطة الأسبوع القادم ومشاركتها برابط جديد.
   ------------------------------------------------------------ */
function clearAllData() {
  if (!confirm("سيتم مسح خطة هذا الأسبوع بالكامل والانتقال لرقم أسبوع جديد. هل تريد المتابعة؟")) return;
  const nextWeek = (state.weekNumber || 1) + 1;
  resetGridKeepingHeader();
  state.weekNumber = nextWeek;
  applyStateToUI();
  scheduleAutosave();
  alert(`✅ تم تجهيز خطة جديدة للأسبوع رقم ${nextWeek}. اكتب المحتوى ثم شاركه مع ولي الأمر برابط جديد.`);
}

/* ------------------------------------------------------------
   11) تصدير واستيراد البيانات بصيغة JSON
   ------------------------------------------------------------ */
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `خطة-اسبوعية-${getCurrentPlanId()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = mergeWithEmptyState(parsed);
      applyStateToUI();
      scheduleAutosave();
      alert("✅ تم استيراد البيانات بنجاح.");
    } catch (e) {
      alert("⚠️ تعذّر قراءة الملف، تأكد أنه ملف JSON صحيح.");
    }
  };
  reader.readAsText(file);
}

/* ------------------------------------------------------------
   12) الطباعة و PDF — تُبنى صفحة منظمة مخصّصة للطباعة (يوماً بيوم،
   كل مادة بها محتوى في جدول واضح) بدلاً من التقاط صورة للجدول
   التفاعلي المضغوط (الذي يصعب قراءته في ملف مطبوع).
   ------------------------------------------------------------ */
function escapeHtml(str) {
  return (str || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

// يبني صفحة طباعة منظمة (يوم بيوم) من بيانات الخطة الحالية، وتُستخدم
// في كل من الطباعة العادية (window.print) وفي تحميل PDF
function buildPrintableArea() {
  const container = document.getElementById("printableArea");
  if (!container) return;

  const metaRows = [
    ["العام الأكاديمي", state.academicYear],
    ["الصف", state.grade],
    ["الشعبة", state.section],
    ["رائد الصف", state.homeroom],
    ["اسم الطالب", state.studentName],
    ["الأسبوع", state.weekNumber],
  ]
    .filter(([, v]) => v)
    .map(
      ([label, value]) =>
        `<div class="print-meta-item"><span class="print-meta-label">${escapeHtml(label)}</span><span class="print-meta-value">${escapeHtml(value)}</span></div>`
    )
    .join("");

  let daysHtml = "";
  WEEK_DAYS.forEach((day) => {
    const rows = SUBJECTS.map((sub) => {
      const entry = state.days[day.key][sub.key] || {};
      if (!entry.lesson && !entry.hw && !entry.exam) return "";
      return `
        <tr>
          <td class="print-subject-cell">${sub.icon} ${escapeHtml(sub.name)}</td>
          <td>${escapeHtml(entry.lesson) || "—"}</td>
          <td>${escapeHtml(entry.hw) || "—"}</td>
          <td>${escapeHtml(entry.exam) || "—"}</td>
        </tr>`;
    }).join("");

    if (!rows) return; // تخطَّ الأيام التي لا تحتوي أي محتوى مكتوب إطلاقاً

    daysHtml += `
      <div class="print-day-block">
        <h2 class="print-day-title">📅 ${escapeHtml(day.name)}</h2>
        <table class="print-day-table">
          <thead>
            <tr><th>المادة</th><th>📘 الدرس</th><th>🟢 الواجب</th><th>🔴 الاختبار</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  });

  if (!daysHtml) {
    daysHtml = `<p class="print-empty">لا يوجد محتوى مكتوب بعد لهذا الأسبوع.</p>`;
  }

  const notesHtml = state.parentNotes
    ? `<div class="print-notes"><h2>💛 ملاحظات لولي الأمر</h2><p>${escapeHtml(state.parentNotes)}</p></div>`
    : "";

  const logoHtml = state.logo ? `<img src="${state.logo}" class="print-logo" alt="شعار المدرسة">` : "";

  container.innerHTML = `
    <div class="print-header">
      ${logoHtml}
      <div class="print-school">🏫 مدرسة السلف الصالح الخاصة</div>
      <h1>الخطة الأسبوعية للطالب</h1>
      <div class="print-meta-grid">${metaRows}</div>
    </div>
    ${daysHtml}
    ${notesHtml}
    <div class="print-footer">تم إنشاء هذه الخطة عبر نظام الخطة الأسبوعية للطالب — ${new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</div>
  `;
}

function printPlan() {
  buildPrintableArea();
  window.print();
}

function downloadPdf() {
  if (typeof html2pdf === "undefined") {
    alert("تعذّر تحميل أداة PDF، تأكد من اتصالك بالإنترنت ثم أعد المحاولة، أو استخدم زر الطباعة واختر «حفظ كـ PDF».");
    return;
  }

  buildPrintableArea();
  document.body.classList.add("print-mode");
  const el = document.getElementById("printableArea");

  // مهلة قصيرة كي تُطبَّق الأنماط قبل الالتقاط
  setTimeout(() => {
    const opt = {
      margin: 10,
      filename: `خطة-اسبوعية-${getCurrentPlanId()}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    html2pdf()
      .set(opt)
      .from(el)
      .save()
      .then(() => {
        document.body.classList.remove("print-mode");
      })
      .catch((e) => {
        console.error("تعذّر إنشاء PDF:", e);
        alert("⚠️ تعذّر إنشاء ملف PDF. جرّب زر «طباعة» ثم اختر «حفظ كـ PDF» من نافذة الطباعة كبديل موثوق.");
        document.body.classList.remove("print-mode");
      });
  }, 150);
}

/* ------------------------------------------------------------
   13) المشاركة مع ولي الأمر (رابط للقراءة فقط بدون تسجيل دخول)
   يتم تضمين بيانات الخطة داخل الرابط نفسه (بعد الترميز)، لذا
   يعمل الرابط فوراً من أي جهاز دون الحاجة لخادم أو تسجيل دخول.
   الرابط يعرض لقطة (Snapshot) من خطة هذا الأسبوع فقط، وهو رابط
   للقراءة فقط ولا يمكن التعديل عليه إطلاقاً، ويمكن لولي الأمر
   تحميله كملف PDF من نفس الصفحة. عند كتابة خطة أسبوع جديد
   (بعد المسح) يجب إنشاء رابط جديد ومشاركته من جديد.
   ------------------------------------------------------------ */
function encodeStateToHash(data) {
  const json = JSON.stringify(data);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64;
}

function decodeStateFromHash(hash) {
  const json = decodeURIComponent(escape(atob(hash)));
  return JSON.parse(json);
}

function buildShareLink() {
  const encoded = encodeStateToHash(state);
  const url = new URL(window.location.href.split("#")[0].split("?")[0]);
  // معاملات مقروءة (صف/شعبة/أسبوع/عام) لسهولة التعرف على الرابط + البيانات نفسها مرمّزة بعدها
  url.searchParams.set("grade", state.grade || "");
  url.searchParams.set("section", state.section || "");
  url.searchParams.set("week", state.weekNumber || 1);
  url.searchParams.set("year", state.academicYear || "");
  url.hash = `share=${encoded}`;
  return url.toString();
}

function openShareModal() {
  const link = buildShareLink();
  document.getElementById("shareLinkInput").value = link;

  const classLabel = `${state.grade || ""} ${state.section || ""}`.trim() || "الصف";
  const message = encodeURIComponent(
    `الخطة الأسبوعية لـ${classLabel} — الأسبوع ${state.weekNumber} (رابط للقراءة فقط): ${link}`
  );
  document.getElementById("btnWhatsapp").href = `https://wa.me/?text=${message}`;
  document.getElementById("btnEmail").href = `mailto:?subject=${encodeURIComponent(
    "الخطة الأسبوعية للطالب"
  )}&body=${message}`;

  document.getElementById("shareModal").classList.remove("hidden");
}

function closeShareModal() {
  document.getElementById("shareModal").classList.add("hidden");
}

// عند فتح الصفحة من رابط مشاركة: تفعيل وضع القراءة فقط
function checkReadOnlyFromHash() {
  const hash = window.location.hash;
  if (hash.startsWith("#share=")) {
    try {
      const data = decodeStateFromHash(hash.replace("#share=", ""));
      state = mergeWithEmptyState(data);
      enterReadOnlyMode();
      return true;
    } catch (e) {
      console.error("تعذّر قراءة رابط المشاركة", e);
    }
  }
  return false;
}

function enterReadOnlyMode() {
  isReadOnly = true;
  document.body.classList.add("read-only-mode");
  document.getElementById("readOnlyBanner").classList.remove("hidden");
  document.getElementById("dbSetupBanner").classList.add("hidden"); // غير ذي صلة بصفحة ولي الأمر
  document.getElementById("toolbar").classList.add("hidden");
  document.getElementById("parentDownloadBar").classList.remove("hidden");
  lockAllFields(true);
}

/* ------------------------------------------------------------
   14) وضع القفل/التعديل
   ------------------------------------------------------------ */
function lockAllFields(lock) {
  document
    .querySelectorAll(
      "#weekGrid [data-type], #parentNotes, .header-grid input, .header-grid select, #weekInput, #logoInput, #btnRetrievePlan"
    )
    .forEach((el) => (el.disabled = lock));
}

function toggleEditMode() {
  isLocked = !isLocked;
  lockAllFields(isLocked);
  const btn = document.getElementById("btnEdit");
  btn.innerHTML = isLocked ? "🔓 فتح للتعديل" : "✏️ تعديل";
}

/* ------------------------------------------------------------
   15) الحفظ السحابي مُفعَّل فعلياً أعلاه عبر Firestore (راجع
   FIREBASE_CONFIG وinitFirebaseIfConfigured في بداية الملف)،
   ويُستخدَم تلقائياً داخل getPlanById وsavePlan إن كان مفعّلاً.
   ------------------------------------------------------------ */

/* ------------------------------------------------------------
   16) ربط الأزرار والقوائم
   ------------------------------------------------------------ */
function bindToolbar() {
  document.getElementById("btnSave").addEventListener("click", async () => await savePlan(true));
  document.getElementById("btnEdit").addEventListener("click", toggleEditMode);
  document.getElementById("btnPrint").addEventListener("click", printPlan);
  document.getElementById("btnPdf").addEventListener("click", downloadPdf);
  document.getElementById("btnShare").addEventListener("click", openShareModal);

  document.getElementById("closeShareModal").addEventListener("click", closeShareModal);
  document.getElementById("shareModal").addEventListener("click", (e) => {
    if (e.target.id === "shareModal") closeShareModal();
  });
  document.getElementById("btnCopyLink").addEventListener("click", () => {
    const input = document.getElementById("shareLinkInput");
    input.select();
    navigator.clipboard?.writeText(input.value);
    document.getElementById("btnCopyLink").textContent = "✅ تم النسخ";
    setTimeout(() => (document.getElementById("btnCopyLink").textContent = "📋 نسخ"), 1500);
  });

  // زر تحميل PDF الخاص بولي الأمر (يظهر فقط في وضع القراءة فقط)
  document.getElementById("btnParentDownload").addEventListener("click", downloadPdf);

  // القائمة المنسدلة (المزيد)
  const menuBtn = document.getElementById("btnMenuToggle");
  const menu = document.getElementById("menuDropdown");
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");
  });
  document.addEventListener("click", () => menu.classList.add("hidden"));

  document.getElementById("btnCopyPrev").addEventListener("click", copyPreviousWeek);
  document.getElementById("btnClearAll").addEventListener("click", clearAllData);
  document.getElementById("btnExport").addEventListener("click", exportJSON);
  document.getElementById("btnImportTrigger").addEventListener("click", () =>
    document.getElementById("fileImport").click()
  );
  document.getElementById("fileImport").addEventListener("change", (e) => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
  });
}

/* ------------------------------------------------------------
   17) بدء التشغيل
   ------------------------------------------------------------ */
async function init() {
  document.getElementById("footerDate").textContent = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  initFirebaseIfConfigured();

  buildGrid();
  bindHeaderInputs();
  bindToolbar();

  const cameFromShareLink = checkReadOnlyFromHash();
  // لا يوجد "آخر خطة" تُحفظ محلياً بعد الآن: الصفحة تبدأ فارغة حتى يختار
  // المعلم العام الأكاديمي والأسبوع والصف والشعبة، فيُسترجع تلقائياً
  // (أو تُنشأ خطة جديدة) مباشرة من قاعدة البيانات.

  applyStateToUI();
}

document.addEventListener("DOMContentLoaded", init);
