# التشغيل والنشر

## المتطلبات

- Node.js 20 أو أحدث
- API المشترك من مشروع MIS على المنفذ `4012`
- وصول قراءة إلى `NEGT_HQ_ATTN`، واختياري إلى `NEGTPAYROLL_UAE`

## متغيرات البيئة

انسخ الأسماء من `deploy/env.example` إلى `server/.env` في مشروع MIS. لا تضع كلمات السر في Git.

```text
HQ_ATTN_SERVER
HQ_ATTN_USER
HQ_ATTN_PASSWORD
HQ_ATTN_DATABASE
HQ_ATTN_CACHE_TTL_MS
SQL_DB_SERVER
SQL_DB_USER
SQL_DB_PASSWORD
SQL_DB_DATABASE
```

## تطوير الواجهة

```bash
cd web
npm install
npm run dev
```

يفتح Vite على `0.0.0.0:4022` وبالمسار `/hq-attendance/`. طلبات `/api` تُحوَّل في التطوير إلى `127.0.0.1:4012`.

```bash
npm run build
npm run preview
```

## نشر الواجهة

من مجلد المصدر داخل MIS (`hq-attendance/`)، بعد البناء:

```bash
npm run build
rsync -a --delete dist/ /var/www/mis-dashboard/hq-attendance/
```

nginx يخدم المسار كما في `deploy/nginx-hq-attendance.conf`.

التحقق:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://mis.neweast.cloud/hq-attendance/
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4012/api/hq-attendance
```

المتوقّع `200` للصفحة. الـ API يعيد JSON فيه `rowCount` و `events`.

## نشر تغيير في القراءة أو أنواع الأبواب

```bash
cd /home/negt/MIS/server
npm run build
pm2 restart mis-dashboard-api
```

## ما لا يُنشر

- `node_modules/`
- `dist/`
- أي ملف `.env` أو كلمة سر
- ملف `hq-device-roles.json` إذا احتوى تعديلات تشغيل خاصة بالسيرفر؛ الأنواع الافتراضية لـ Food Court موجودة في الكود
