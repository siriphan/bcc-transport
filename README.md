# Income Expense Dashboard — GitHub + Cloudflare Final

พร้อม Upload ขึ้น GitHub และเชื่อม Cloudflare Workers + D1

## สิ่งที่รวมไว้
- Template สี Aqua Technology ตามตัวอย่าง
- Export รูปภาพแสดงรายรับ/รายจ่ายครบทุกแถว โดยปรับความสูงภาพอัตโนมัติ
- ปุ่มแสดงผลบนมือถือแนวตั้ง
- ใช้ตัวเลขแทนกราฟทั้งหมด
- รายรับ/รายจ่ายแยกรายเดือน เพิ่ม/ลบ/แก้ไขได้
- ไม่มี auto refresh/polling
- Cloudflare Workers Static Assets + D1

## Cloudflare config
- Worker name: `income-expense-tracker`
- D1 database: `income-expense-dashboard-db`
- D1 database_id: `4ea2c6ef-d6c6-4b3c-b11f-4ea4eea43f64`

## Deploy local
```bash
npm install
npx wrangler d1 execute income-expense-dashboard-db --file=./schema.sql --remote
npm run deploy
```

## Upload GitHub
```bash
git init
git add .
git commit -m "Deploy income expense dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## GitHub Actions secrets
เพิ่มใน Repository > Settings > Secrets and variables > Actions:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```
