# البيانات وواجهة API

كل القراءة من SQL Server. لا يوجد `INSERT` أو `UPDATE` على قاعدة البصمات أو الرواتب.

## البصمات

| البند | القيمة |
| --- | --- |
| المتغير | `HQ_ATTN_SERVER` |
| القاعدة | `NEGT_HQ_ATTN` |
| الجدول | `dbo.HCP_Access` |
| الكاش | `HQ_ATTN_CACHE_TTL_MS`، الافتراضي 60 ثانية |

الحقول المستخدمة تشمل الاسم، رقم الموظف، القسم، الجهاز، السيريال، التاريخ، الوقت، والاتجاه.

اتجاه الجهاز واسم المبنى والطابق تُستنتج في `api/hq-attendance.ts` من اسم القارئ عندما لا يكون الاتجاه صريحاً.

## الموظفون

إذا كانت متغيرات SQL للرواتب موجودة، يُقرأ الاسم والقسم والمسمى من `NEGTPAYROLL_UAE.dbo.Pr_EmpMaster` عبر `HRM_EmpId`. فشل هذا الاستعلام لا يوقف البصمات؛ يظهر الاسم القادم من جهاز الدخول.

## أنواع الأبواب

`GET` و `PUT` على `/api/hq-attendance/device-roles`.

الملف المحلي على سيرفر الـ API: `server/data/hq-device-roles.json`. هذا هو الكتابة الوحيدة، وهي خارج SAP وخارج قاعدة البصمات. جهازا Food Court يبقيان داخليين حتى لو حاول الحفظ تغييرهما.

## الطلبات

القاعدة الحية: `https://mis.neweast.cloud/api/hq-attendance` وتعمل عبر nginx إلى `127.0.0.1:4012`.

| الطريقة | المسار | النتيجة |
| --- | --- | --- |
| GET | `/api/hq-attendance` | `{ cachedAt, rowCount, events }` |
| GET | `/api/hq-attendance/device-roles` | الأنواع المحفوظة |
| PUT | `/api/hq-attendance/device-roles` | حفظ محلي لنوع الباب. الجسم: `{ "devices": [{ "serial", "name", "role" }] }` |

الواجهة في `web/src/App.tsx` تستدعي نفس الأصل: `/api/hq-attendance`.

الوحدتان في هذا المستودع هما المصدر المنسوخ من MIS:

- `api/hq-attendance.ts` — قراءة البصمات والرواتب
- `api/hq-device-roles.ts` — قراءة وحفظ أنواع الأبواب

يتم وصلهما من `server/src/index.ts` في مشروع MIS المشترك، والعملية تعمل تحت pm2 بالاسم `mis-dashboard-api`.
