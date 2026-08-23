# 🪪 Card Generator Pro

> **Bulk Membership Card Generator** — Generate, customize, and upload thousands of membership cards automatically.

---

## ✨ Overview

**Card Generator Pro** is a fully browser-based web application that allows you to:

1. Upload a card template image (your card background)
2. Upload an Excel file containing member data
3. Automatically generate a personalized card for each member
4. Upload every card to **Cloudinary** cloud storage
5. Download a new Excel file with each member's unique card URL

No installation. No programming. No terminal. Just open the page in your browser.

---

## 🚀 Features

| Feature | Details |
|---------|---------|
| 🖼️ **Template Upload** | Drag & Drop any JPG/PNG/WebP image |
| 📊 **Excel Support** | .xlsx and .xls, auto-detects column names |
| ☁️ **Cloudinary Integration** | Unsigned preset or signed API Key upload |
| 🎨 **Live Card Preview** | See exactly where text will appear before generating |
| 📍 **Custom Coordinates** | Set X/Y position + alignment for Name, ID, Expiry |
| 🔤 **Font Control** | Family, size, color, bold, text shadow |
| ⚡ **Batch Processing** | Processes in configurable batches (default: 50) |
| 🔋 **Memory Efficient** | Handles 5,000+ cards without freezing |
| 🛡️ **Error Resilient** | One failed card never stops the whole process |
| 📋 **Execution Log** | Full log with timestamps, downloadable as .txt |
| 📥 **Excel Output** | `members_output.xlsx` with `Card_URL` column added |
| 🌙 **Dark / Light Mode** | Saved to browser, no flash on reload |
| 💾 **Persistent Settings** | Cloudinary, layout, font — all saved in LocalStorage |
| ✋ **Cancel Anytime** | Stop generation mid-run |
| 🌍 **Arabic Support** | Full UTF-8, RTL names render correctly on cards |

---

## 📁 Project Structure

```
card-generator/
├── index.html              # Main entry point (open this in browser)
├── css/
│   ├── main.css            # Design system, CSS variables, dark mode
│   ├── components.css      # Buttons, dropzones, stats, log panel
│   └── animations.css      # Micro-animations, transitions
├── js/
│   ├── app.js              # Main orchestrator (entry point)
│   ├── storage.js          # LocalStorage CRUD helpers
│   ├── excel.js            # SheetJS wrapper (read/write Excel)
│   ├── canvas.js           # Canvas card drawing engine
│   ├── cloudinary.js       # Cloudinary upload via REST API
│   ├── processor.js        # Batch processing engine
│   ├── logger.js           # Logging system with export
│   └── ui.js               # DOM helpers, toast, progress
└── README.md
```

---

## 📋 Excel File Format

Your input Excel file should have at least these three columns:

| Name | Member_ID | Expiry | (any other columns...) |
|------|-----------|--------|------------------------|
| Ahmed Ali | MEM-001 | 31/12/2025 | ... |
| Sara Hassan | MEM-002 | 01/06/2026 | ... |

> **✅ Column names are detected automatically** — they can be in any case (Name, name, NAME) or Arabic (الاسم, رقم العضوية, تاريخ الانتهاء).
>
> **✅ All other columns are preserved** in the output Excel file.
>
> **✅ A new column `Card_URL`** is added to the output file with each member's Cloudinary image URL.

---

## ☁️ Cloudinary Setup (Step-by-Step)

### Method A — Unsigned Upload (Recommended for non-developers)

1. Go to [cloudinary.com](https://cloudinary.com) and create a free account
2. From your Dashboard, copy your **Cloud Name** (e.g., `my-cloud-name`)
3. Go to **Settings** → **Upload** tab
4. Scroll to **Upload presets** → click **Add upload preset**
5. Set **Signing Mode** to **Unsigned** → give it a name (e.g., `cards_preset`)
6. Click **Save**
7. In Card Generator Pro (Step 3):
   - Enter your **Cloud Name**
   - Enter the **Upload Preset** name
   - Click **Save Cloudinary Settings**

### Method B — Signed Upload (for existing Cloudinary users)

1. Copy your **Cloud Name**, **API Key**, and **API Secret** from your Cloudinary dashboard
2. In Card Generator Pro (Step 3), enter all three fields
3. Click **Save Cloudinary Settings**

> All cards are uploaded to: `cards/<Member_ID>.jpg`
> If a card with the same Member_ID already exists, it will be **overwritten**.

---

## 🖥️ How to Use — Step by Step

### First Time Setup (do once)

1. **Open** `index.html` in your web browser (Chrome or Edge recommended)
2. **Step 3** → Enter Cloudinary credentials → Click **Save Cloudinary Settings**
3. **Step 4** → Adjust text positions and font → Click **Save Settings**

### Every Generation Run

1. **Step 1** — Drag & drop your card template image (JPG/PNG)
2. **Step 2** — Drag & drop your Excel file (.xlsx)
3. **Step 5 (Optional)** — Adjust batch size if needed
4. Click **🚀 Generate Cards**
5. Watch the live progress — counters update in real time
6. When done, click **📥 Download members_output.xlsx**

> ⚠️ **Do not close the tab** while generation is in progress.

---

## 📍 Setting Text Coordinates

Each field (Name, Member ID, Expiry) has an **X** and **Y** coordinate in pixels.

- **X** = distance from the left edge of the card image
- **Y** = distance from the top edge of the card image

**How to find the right coordinates:**
1. Open your card template in **Microsoft Paint**, **Photoshop**, or any image editor
2. Hover your cursor over the spot where you want the text
3. Note the pixel coordinates shown at the bottom of the screen
4. Enter those values in **Step 4**

**Alignment options:**
- `Center` — X is the horizontal center point of the text
- `Left` — X is the left edge of the text
- `Right` — X is the right edge of the text

Use the **Live Preview** panel to verify placement with sample data before generating.

---

## ⚙️ Performance Guide

| Number of Members | Recommended Batch Size | Estimated Time |
|-------------------|------------------------|----------------|
| 1 – 100 | 50 (default) | < 2 minutes |
| 100 – 500 | 50 | 5 – 15 minutes |
| 500 – 1,000 | 30 | 15 – 40 minutes |
| 1,000 – 5,000 | 20 | 1 – 4 hours |
| 5,000+ | 10 | Overnight recommended |

> ⚡ Speed depends on your internet connection (upload speed) and Cloudinary response time.
>
> 💡 Reduce batch size if the browser feels slow or you have a slow connection.

---

## 📄 Log File

After generation, download the **Log File** (`.txt`) which contains:

```
======================================================================
   MEMBERSHIP CARD GENERATOR — EXECUTION LOG
======================================================================

Start Time  : 7/16/2025, 10:30:00 AM
End Time    : 7/16/2025, 11:02:44 AM
Duration    : 32:44
Total       : 500
Generated   : 498
Uploaded    : 498
Failed      : 2

----------------------------------------------------------------------
  DETAILED LOG
----------------------------------------------------------------------

10:30:00     [INFO]      Starting processing of 500 members in batches of 50
10:30:01     [INFO]      Generated card for: Ahmed Ali (MEM-001)
10:30:02     [SUCCESS]   Uploaded: Ahmed Ali → https://res.cloudinary.com/...
...
10:45:12     [ERROR]     Failed: Invalid Name (MEM-099) — Cloudinary error: ...
                         Member: Invalid Name
                         Reason: Missing upload_preset
```

---

## 🛠️ Technical Details

| Technology | Usage |
|------------|-------|
| **HTML5 Canvas API** | Drawing card images with text overlay |
| **SheetJS (xlsx)** | Reading and writing Excel files |
| **Cloudinary REST API** | Image upload via `fetch()` |
| **ES Modules** | Clean, modular JavaScript architecture |
| **LocalStorage** | Persistent settings (no server needed) |
| **Web Crypto API** | SHA-1 signature for signed Cloudinary uploads |

---

## 🌐 Browser Compatibility

| Browser | Status |
|---------|--------|
| ✅ Chrome 90+ | Fully supported |
| ✅ Edge 90+ | Fully supported |
| ✅ Firefox 88+ | Fully supported |
| ⚠️ Safari 15+ | Supported (some animation differences) |

> ❌ **Internet Explorer is not supported.**

---

## 🔒 Privacy & Security

- **All processing happens locally in your browser**
- No member data is sent to any server except Cloudinary (only the generated image)
- Cloudinary credentials are stored in your browser's LocalStorage only
- No tracking, no analytics, no external data collection

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cloud Name is required" | Enter Cloud Name in Step 3 and click Save |
| "Upload failed: Missing preset" | Create an unsigned upload preset in Cloudinary Settings |
| Template not showing in preview | Make sure image file is JPG/PNG/WebP |
| Arabic text not rendering correctly | Use font "Cairo" or "Tajawal" in font settings |
| Cards generating but not uploading | Check internet connection and Cloudinary credentials |
| Progress bar stuck | Reduce batch size and try again |
| Excel columns not detected | Rename columns to: Name, Member_ID, Expiry |

---

## 👨‍💻 Developer Notes

- The app uses **ES Modules** — it must be served via HTTP, not opened as a file directly in some browsers
  - **Chrome/Edge**: Opening `index.html` directly (via `file://`) works for these browsers
  - If you get CORS or module errors, use a local server: `python -m http.server 8080` or VS Code Live Server
- Cloudinary unsigned uploads require an **upload preset** configured as "Unsigned" in the Cloudinary dashboard
- The hidden `<canvas id="work-canvas">` element is reused for all card generation (memory efficient)

---

## 📝 License

This project is provided for personal and commercial use. Cloudinary usage is subject to [Cloudinary's Terms of Service](https://cloudinary.com/tos).

---

*Built with ❤️ — Production Ready*
