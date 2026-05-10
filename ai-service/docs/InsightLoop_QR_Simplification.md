# InsightLoop — QR Code Simplification
> **For:** Purvi (Node backend changes)  
> **Decision:** QR images are generated client-side. Node no longer generates or saves images.

---

## What Changes in Node

### Remove These

| What | Where |
|---|---|
| `qrcode` npm package usage | `forms.controller.js` or wherever QR is generated |
| File write to `/uploads/qrcodes/` | Same location |
| `qr_image_url` field | Remove from API response |
| `qr_data_url` field (the base64 string) | Remove from API response |
| `/uploads/qrcodes/` directory creation | Server setup / app.js |

The only thing Node needs to do with QR is **construct the `public_url` string and save it to the database.** No image generation, no file system, no base64.

---

## Do We Still Need the `qr_codes` Table?

**Yes — keep it, but simplify it.**

The `public_url` must be stored somewhere so the frontend can fetch it later (to show the QR modal, copy the link, download the QR). The `qr_codes` table is the right place.

**Drop these columns — they are no longer needed:**

```sql
ALTER TABLE qr_codes DROP COLUMN qr_image_path;
```

If the table was freshly created and has no production data yet, just recreate it:

```sql
DROP TABLE IF EXISTS qr_codes;

CREATE TABLE qr_codes (
    qr_id       VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
    form_id     VARCHAR(36)  NOT NULL UNIQUE,
    public_url  VARCHAR(500) NOT NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

That is the entire table now. Three columns that matter: `qr_id`, `form_id`, `public_url`.

---

## The Public URL Problem — And The Correct Fix

### What Is Currently Wrong

```
"public_url": "http://localhost:5000/form/f4729d83-..."
```

Three problems with this:

**1. It points to Node (port 5000), not the frontend.**  
The customer should land on a frontend HTML page, not a raw Node route. Node should not be serving the feedback form — the frontend `feedback.html` page should.

**2. `localhost` is hardcoded.**  
When deployed to Render or any server, `localhost:5000` is meaningless to a customer scanning a QR code on their phone. This URL breaks immediately on deployment.

**3. The path `/form/` may not match the frontend page.**  
The frontend feedback page will be at `feedback.html?form_id=uuid` — not `/form/uuid`.

---

### The Correct Approach — Environment Variable

Purvi adds one variable to her `.env` file:

```env
# .env
FRONTEND_BASE_URL=http://localhost:3000
```

In production (Render, Railway, etc.), this becomes:
```env
FRONTEND_BASE_URL=https://insightloop.com
```

She never changes any code when deploying — only the env var changes.

---

### How She Constructs the URL

When a form is created and she builds the `public_url` to insert into `qr_codes`:

```javascript
const publicUrl = `${process.env.FRONTEND_BASE_URL}/feedback.html?form_id=${form_id}`;
```

**Result:**

| Environment | URL produced |
|---|---|
| Local dev | `http://localhost:3000/feedback.html?form_id=f4729d83-...` |
| Production | `https://insightloop.com/feedback.html?form_id=f4729d83-...` |

The customer scans the QR, their phone opens this URL, the `feedback.html` page reads `form_id` from the URL query param, fetches the form questions, and renders them. This is the complete and correct flow.

---

## What the API Response Should Look Like Now

**Before (current — wrong):**
```json
"qr_code": {
    "qr_id": "uuid",
    "public_url": "http://localhost:5000/form/uuid",
    "qr_image_url": "http://localhost:5000/uploads/qrcodes/qr_uuid.png",
    "qr_data_url": "data:image/png;base64,iVBORw0KGgo...",
    "created_at": "2026-05-10T05:18:47.000Z"
}
```

**After (correct):**
```json
"qr_code": {
    "qr_id": "uuid",
    "public_url": "http://localhost:3000/feedback.html?form_id=f4729d83-4c1e-11f1-841c-525400978d46",
    "created_at": "2026-05-10T05:18:47.000Z"
}
```

Clean. The frontend receives `public_url`, passes it to `qrcode.js`, and generates the QR image in the browser instantly.

---

## How the Frontend Uses This

In `forms.js`, when the business owner clicks "View QR" on a form card:

```javascript
// Frontend already has public_url from the create form response
// or fetches it from GET /api/qr/:form_id

function showQRModal(publicUrl, formTitle) {
    document.getElementById('qrFormTitle').textContent = formTitle;
    document.getElementById('qrContainer').innerHTML = '';  // clear previous

    new QRCode(document.getElementById('qrContainer'), {
        text:       publicUrl,
        width:      220,
        height:     220,
        colorDark:  '#000000',
        colorLight: '#ffffff'
    });

    document.getElementById('qrPublicUrl').textContent = publicUrl;
}

function downloadQR() {
    const canvas = document.querySelector('#qrContainer canvas');
    const link   = document.createElement('a');
    link.download = 'insightloop-qr.png';
    link.href     = canvas.toDataURL('image/png');
    link.click();
}

function copyLink(publicUrl) {
    navigator.clipboard.writeText(publicUrl);
    showToast('Link copied to clipboard!', 'success');
}
```

QR code CDN to add to `forms.html`:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
```

---

## Summary Checklist for Purvi

- [ ] Add `FRONTEND_BASE_URL=http://localhost:3000` to `.env`
- [ ] Remove `qrcode` image generation code (the PNG file write)
- [ ] Remove `/uploads/qrcodes/` directory logic
- [ ] Change `public_url` construction to use `process.env.FRONTEND_BASE_URL`
- [ ] Change path from `/form/:id` to `/feedback.html?form_id=:id`
- [ ] Drop `qr_image_path` column from `qr_codes` table (or recreate it clean)
- [ ] Remove `qr_image_url` and `qr_data_url` from the API response
- [ ] Test: create a form, check that `public_url` in response points to `localhost:3000/feedback.html?form_id=...`

---

*End of QR Simplification Guide*