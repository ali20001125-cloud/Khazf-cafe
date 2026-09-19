/**
 * رسمُ المشروب حين لا تكون ثمّة صورة.
 *
 * ثلاثة أسباب لأن يُرسم بدل أن يُجلب:
 *   ١. **لا ينكسر.** رابطُ صورةٍ من الإنترنت قد يُحذف أو يُحجب، فيرى
 *      الزبون مربّعاً مكسوراً على الطاولة. وهذا أسوأ من لا صورة.
 *   ٢. **لا ينتظر.** يصل مع الصفحة نفسها، بلا طلبٍ ثانٍ على بيانات
 *      الهاتف — والزبون يفتح المنيو وهو جالسٌ ينتظر.
 *   ٣. **يشبه المحلّ.** ألوانه ألوان خزف نفسها، لا ألوان صورة مخزنٍ
 *      التقطها أحدٌ في مقهىً آخر.
 *
 * وحين يضع المالك صورةً حقيقية، تحلّ محلّه — فهذا أرضيّةٌ لا سقف.
 */

type Kind = "espresso" | "hot" | "cold" | "filter" | "retail";

/**
 * أزواجٌ دافئة من لوحة خزف: كل مشروب يأخذ زوجه ثابتاً من اسمه.
 *
 * ومتباعدةٌ عمداً. خمسة تدرّجاتٍ متقاربة تجعل الشبكة تبدو بطاقةً واحدة
 * مكرّرة — والعين تمرّ عليها بلا أن ترى فيها أصنافاً.
 */
const WASH: [string, string][] = [
  ["#F6ECE0", "#DFC4A6"], // رمليّ فاتح
  ["#EDE3D6", "#C9AD8C"], // بنّيّ مغبَّر
  ["#F4E2CE", "#D8A97C"], // طينيّ دافئ
  ["#E9E4DA", "#BFB19C"], // طَفَليّ هادئ
  ["#F7EDE2", "#E4B98C"], // عسليّ
  ["#E6DCCE", "#B4A28C"], // رماديّ دافئ
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function artKind(category: string, kind: string): Kind {
  if (kind === "retail") return "retail";
  if (category === "espresso") return "espresso";
  if (category === "cold") return "cold";
  if (category === "filter") return "filter";
  return "hot";
}

export default function DrinkArt({
  name,
  kind,
  className = "",
}: {
  name: string;
  kind: Kind;
  className?: string;
}) {
  const [a, b] = WASH[hash(name) % WASH.length];
  const gid = `w${hash(name).toString(36)}`;

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gid})`} />
      {/* قرصٌ باهت خلف الكوب يعطي عمقاً بلا ظلّ ثقيل */}
      <circle cx="50" cy="48" r="36" fill="#FFFFFF" opacity="0.3" />
      <circle cx="50" cy="48" r="36" fill="none" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.5" />
      {/* الرسم يملأ البلاطة: كوبٌ صغير وسط مساحةٍ كبيرة يبدو بقعةً لا صورة */}
      <g transform="translate(50 50) scale(1.22) translate(-50 -50)">
        {kind === "espresso" && <Espresso />}
        {kind === "hot" && <Hot />}
        {kind === "cold" && <Cold />}
        {kind === "filter" && <Filter />}
        {kind === "retail" && <Bag />}
      </g>
    </svg>
  );
}

const INK = "#2A2320";
const CREMA = "#B4794F";
const DARK = "#4A3122";
const CUP = "#FCFAF6";

/** فنجان صغير، كريما كثيفة — الإسبريسو يُعرف من نسبته لا من حجمه. */
function Espresso() {
  return (
    <g>
      <ellipse cx="50" cy="72" rx="20" ry="3.2" fill={INK} opacity="0.1" />
      <path d="M34 47h32v10a16 16 0 0 1-16 16 16 16 0 0 1-16-16z" fill={CUP} />
      <path d="M66 50h4a7 7 0 0 1 0 14h-4" fill="none" stroke={CUP} strokeWidth="4" />
      <ellipse cx="50" cy="47" rx="16" ry="4.6" fill={DARK} />
      <ellipse cx="50" cy="46.4" rx="13.4" ry="3.7" fill={CREMA} />
      <ellipse cx="45.6" cy="45.8" rx="4" ry="1.3" fill="#D6A472" opacity="0.7" />
    </g>
  );
}

/** كوبٌ على صحن وقلبٌ في الرغوة — علامة الحليب المبخّر. */
function Hot() {
  return (
    <g>
      <ellipse cx="50" cy="76" rx="25" ry="3.6" fill={INK} opacity="0.1" />
      <path d="M31 42h38v13a19 19 0 0 1-19 19 19 19 0 0 1-19-19z" fill={CUP} />
      <path d="M69 46h4.5a8 8 0 0 1 0 16H69" fill="none" stroke={CUP} strokeWidth="4.5" />
      <ellipse cx="50" cy="42" rx="19" ry="5.4" fill="#E9D8C3" />
      <ellipse cx="50" cy="41.4" rx="15.6" ry="4.2" fill="#C99A6C" />
      {/* قلب الرغوة */}
      <path
        d="M50 44.6c-3.4-1.6-6-2.9-6-4.7 0-1.3 1.1-2.1 2.4-2.1 1.2 0 2.3.6 3.6 2 1.3-1.4 2.4-2 3.6-2 1.3 0 2.4.8 2.4 2.1 0 1.8-2.6 3.1-6 4.7z"
        fill={CUP}
      />
      <path d="M26 78h48" stroke={CUP} strokeWidth="3.4" strokeLinecap="round" />
    </g>
  );
}

/** كأسٌ طويل، ثلجٌ وطبقتان — البارد يُعرف من الطبقات. */
function Cold() {
  return (
    <g>
      <ellipse cx="50" cy="80" rx="17" ry="3" fill={INK} opacity="0.1" />
      <path d="M36 24h28l-3 55a3 3 0 0 1-3 2.8H42a3 3 0 0 1-3-2.8z" fill={CUP} opacity="0.95" />
      {/* حليب أسفل، قهوة أعلى */}
      <path d="M38.6 52h22.8l-1.5 27a3 3 0 0 1-3 2.8H43.1a3 3 0 0 1-3-2.8z" fill="#EFE3D2" />
      <path d="M37.3 34h25.4l-1.2 18H38.5z" fill={DARK} opacity="0.88" />
      {/*
        الثلج مُحدَّدٌ لا مُصمَت: مربّعاتٌ فاتحة مليئة على قهوةٍ داكنة
        تُقرأ كبقعٍ أو خللٍ في الرسم، والحدّ الرفيع يجعلها زجاجاً.
      */}
      <g fill={CUP} fillOpacity="0.14" stroke={CUP} strokeOpacity="0.62" strokeWidth="1">
        <rect x="41" y="36.5" width="8" height="8" rx="1.8" transform="rotate(-8 45 40.5)" />
        <rect x="51.5" y="39.5" width="7" height="7" rx="1.6" transform="rotate(10 55 43)" />
        <rect x="45.5" y="45" width="6.5" height="6.5" rx="1.5" transform="rotate(-4 48.75 48.25)" />
      </g>
      {/* المصّاصة */}
      <path d="M58 22 L66 11" stroke={CREMA} strokeWidth="3.4" strokeLinecap="round" />
      <ellipse cx="50" cy="24" rx="14" ry="3.6" fill={CUP} />
      <ellipse cx="50" cy="24" rx="14" ry="3.6" fill="none" stroke={INK} strokeOpacity="0.07" />
    </g>
  );
}

/** قمعٌ فوق إبريق وقطرة — المختصّ يُعرف من أدواته. */
function Filter() {
  return (
    <g>
      <ellipse cx="50" cy="80" rx="19" ry="3" fill={INK} opacity="0.1" />
      {/* الإبريق */}
      <path d="M36 54h28v20a5 5 0 0 1-5 5H41a5 5 0 0 1-5-5z" fill={CUP} />
      <path d="M37.4 64h25.2v10a5 5 0 0 1-5 5H42.4a5 5 0 0 1-5-5z" fill={DARK} opacity="0.82" />
      <path d="M64 58h4a6 6 0 0 1 0 12h-4" fill="none" stroke={CUP} strokeWidth="3.6" />
      {/* القمع */}
      <path d="M32 26h36L54 50H46z" fill={CUP} />
      <path d="M35.6 29.4h28.8L53 48.5h-6z" fill="#E4D2BB" />
      <ellipse cx="50" cy="26" rx="18" ry="4" fill="#F7F1E7" />
      {/* القطرة */}
      <path d="M50 53.5c1.7 2 2.6 3.3 2.6 4.5a2.6 2.6 0 0 1-5.2 0c0-1.2.9-2.5 2.6-4.5z" fill={CREMA} />
    </g>
  );
}

/** كيسٌ بملصق — للبيت. */
function Bag() {
  return (
    <g>
      <ellipse cx="50" cy="80" rx="21" ry="3" fill={INK} opacity="0.1" />
      <path d="M32 30h36v45a4 4 0 0 1-4 4H36a4 4 0 0 1-4-4z" fill="#6B4A32" />
      <path d="M32 30h36v6H32z" fill="#54382413" />
      <path d="M32 30l6-8h24l6 8z" fill="#7C5940" />
      <rect x="40" y="18" width="20" height="5" rx="2.5" fill="#4A3122" />
      {/* الملصق */}
      <rect x="38" y="44" width="24" height="24" rx="4" fill="#F7F1E7" />
      <circle cx="50" cy="53.5" r="5" fill="none" stroke={CREMA} strokeWidth="1.8" />
      <path d="M50 49.4v8.2M46.5 51.4l7 4.2M53.5 51.4l-7 4.2" stroke={CREMA} strokeWidth="1.3" />
      <path d="M43 62.5h14" stroke={CREMA} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
    </g>
  );
}
