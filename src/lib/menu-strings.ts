import type { Lang } from "./menu";

/**
 * كلمات صفحة المنيو بلغتين.
 *
 * **ما يُترجَم هنا هو كلام الصفحة لا كلام المالك.** «المنيو» و«ساخن»
 * و«الطاقة» ثابتةٌ لا يملكها أحد، فتُكتب مرّةً هنا. أمّا أسماء
 * المشروبات وسطورها فيكتبها المالك في لوحته — لأنها ملكه، ولأن
 * «تقطير» تُترجم آلياً «Distillation» وهي عمليّة كيميائية لا مشروب.
 */
export type Strings = {
  menu: string;
  join: string;
  feedback: string;
  soon: string;
  soonNote: string;
  unavailable: string;
  special: string;
  ingredients: string;
  bean: string;
  energy: string;
  caffeine: string;
  kcalUnit: string;
  mgUnit: string;
  approx: string;
  sections: Record<string, string>;
  units: Record<string, string>;
  /** ورقة الرأي — بلغتها كاملةً: نموذجٌ نصفه مترجم يُترك بلا إرسال. */
  fb: {
    title: string;
    promise: string;
    howWas: string;
    aboutItem: string;
    wholeVisit: string;
    say: string;
    sayHint: string;
    phone: string;
    notNow: string;
    send: string;
    thanks: string;
    thanksNote: string;
    close: string;
    ofFive: string;
  };
  /** اسم اللغة الأخرى — على زرّ التبديل، بحروفها هي. */
  other: string;
  otherHref: string;
};

const AR: Strings = {
  menu: "المنيو",
  join: "انضمّ لنادي خزف",
  feedback: "قل لنا رأيك",
  soon: "المنيو قيد التحضير",
  soonNote: "عُد بعد قليل.",
  unavailable: "غير متوفّر اليوم",
  special: "مميّز",
  ingredients: "المكوّنات",
  bean: "البنّ",
  energy: "الطاقة",
  caffeine: "كافيين",
  kcalUnit: "سعرة",
  mgUnit: "ملغ",
  approx: "الأرقام تقريبية، محسوبة من وصفتنا نفسها — تتغيّر بتغيّر الحجم ونوع الحليب والإضافات.",
  sections: {
    espresso: "إسبريسو",
    hot: "ساخن",
    cold: "بارد",
    filter: "مختص",
    other: "أخرى",
    rest: "أخرى",
    home: "للبيت",
  },
  units: { g: "غ", ml: "مل", pcs: "حبة" },
  fb: {
    title: "رأيك",
    promise: "يصل صاحب المحلّ وحده — لا يُنشر على المنيو ولا يراه أحد غيره.",
    howWas: "كيف كانت زيارتك؟",
    aboutItem: "عن مشروبٍ بعينه؟ (اختياري)",
    wholeVisit: "عن الزيارة كلّها",
    say: "ماذا تقول لنا؟",
    sayHint: "ما أعجبك، وما لم يعجبك — كلاهما ينفعنا.",
    phone: "هاتفك إن أردت ردّاً (اختياري)",
    notNow: "ليس الآن",
    send: "أرسل",
    thanks: "وصلَنا. شكراً لك.",
    thanksNote: "يقرؤه صاحب المحلّ بنفسه.",
    close: "أغلق",
    ofFive: "من ٥",
  },
  other: "English",
  otherHref: "/menu/en",
};

const EN: Strings = {
  menu: "MENU",
  join: "Join the Khazaf club",
  feedback: "Tell us what you think",
  soon: "Menu coming soon",
  soonNote: "Check back shortly.",
  unavailable: "Not available today",
  special: "Featured",
  ingredients: "Ingredients",
  bean: "The beans",
  energy: "Energy",
  caffeine: "Caffeine",
  kcalUnit: "kcal",
  mgUnit: "mg",
  approx: "Approximate, calculated from our own recipe — varies with size, milk and extras.",
  sections: {
    espresso: "Espresso",
    hot: "Hot",
    cold: "Cold",
    filter: "Filter",
    other: "Other",
    rest: "Other",
    home: "To take home",
  },
  units: { g: "g", ml: "ml", pcs: "pc" },
  fb: {
    title: "Your thoughts",
    promise: "Goes to the owner only — never published on the menu, never shown to anyone else.",
    howWas: "How was your visit?",
    aboutItem: "About one drink? (optional)",
    wholeVisit: "About the whole visit",
    say: "What would you tell us?",
    sayHint: "What you liked, and what you didn't — both help.",
    phone: "Your phone, if you'd like a reply (optional)",
    notNow: "Not now",
    send: "Send",
    thanks: "Got it. Thank you.",
    thanksNote: "The owner reads it himself.",
    close: "Close",
    ofFive: "of 5",
  },
  other: "العربية",
  otherHref: "/menu",
};

export function strings(lang: Lang): Strings {
  return lang === "en" ? EN : AR;
}
