// ======================
// Backend - server.js
// ======================

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');
fs.ensureDirSync(uploadDir);
fs.ensureDirSync(outputDir);

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'https://legendary-platypus-a867b5.netlify.app/',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use('/output', express.static(outputDir));

let globalDataMap = { "1": [], "2": [] };

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const panelId = req.query.id || '1';
    cb(null, `panel-${panelId}-input.xlsx`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only Excel files allowed'), false);
};

const upload = multer({ storage, fileFilter });

function extractDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + (value - 1) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d{2}-\d{2}-\d{4}/.test(value)) {
    const [d, m, y] = value.split(' ')[0].split('-');
    return new Date(`${y}-${m}-${d}`).toISOString().slice(0, 10);
  }
  return new Date(value).toISOString().slice(0, 10);
}

app.post('/upload', upload.single('file'), (req, res) => {
  try {
    const panelId = req.query.id || '1';
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet);

    if (!rawData.length) return res.status(400).json({ error: 'Excel file is empty' });

    const processedData = rawData.map(row => {
      const dateVal = row['Date'] || row['Transaction Date'] || row['Created At'];
      return {
        ...row,
        DateOnly: extractDateOnly(dateVal)
      };
    });

    const merchants = [...new Set(processedData.map(r => r['Merchant Name']).filter(Boolean))];
    globalDataMap[panelId] = processedData;

    res.json({ success: true, merchants });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

app.post('/generate', (req, res) => {
  try {
    const { merchantPercents, startDate, endDate } = req.body;
    const panelId = req.query.id || '1';
    const data = globalDataMap[panelId];

    if (!data.length) return res.status(400).json({ error: 'No data available' });

    const normalizedStart = new Date(startDate).toISOString().slice(0, 10);
    const normalizedEnd = new Date(endDate).toISOString().slice(0, 10);

    const filteredData = [];
    const summaryData = [];
    let grandW = 0, grandF = 0, grandP = 0;

    for (const merchant in merchantPercents) {
      const percent = parseFloat(merchantPercents[merchant]);
      if (isNaN(percent)) continue;

      const rows = data.filter(row =>
        row.DateOnly >= normalizedStart &&
        row.DateOnly <= normalizedEnd &&
        row['Merchant Name'] === merchant
      );

      if (!rows.length) continue;

      let totalW = 0, totalF = 0, totalP = 0;

      rows.forEach(row => {
        const withdrawal = parseFloat(row['Withdrawal Amount'] || 0);
        const fee = parseFloat(row['Withdrawal Fees'] || 0);
        const percentAmount = withdrawal * percent / 100;

        totalW += withdrawal;
        totalF += fee;
        totalP += percentAmount;

        filteredData.push({
          Merchant: merchant,
          'Withdrawal Amount': withdrawal,
          'Withdrawal Fees': fee,
          [`${percent}% Amount`]: percentAmount.toFixed(2)
        });
      });

      filteredData.push({
        Merchant: `Total of ${merchant}`,
        'Withdrawal Amount': totalW.toFixed(2),
        'Withdrawal Fees': totalF.toFixed(2),
        [`${percent}% Amount`]: totalP.toFixed(2)
      });

      grandW += totalW;
      grandF += totalF;
      grandP += totalP;

      summaryData.push({
        Merchant: merchant,
        'Total Withdrawal Amount': totalW.toFixed(2),
        'Total Withdrawal Fees': totalF.toFixed(2),
        [`${percent}% Amount`]: totalP.toFixed(2)
      });
    }

    filteredData.push({
      Merchant: 'GRAND TOTAL',
      'Withdrawal Amount': grandW.toFixed(2),
      'Withdrawal Fees': grandF.toFixed(2),
      [`TOTAL % Amount`]: grandP.toFixed(2)
    });

    summaryData.push({
      Merchant: 'TOTAL',
      'Total Withdrawal Amount': grandW.toFixed(2),
      'Total Withdrawal Fees': grandF.toFixed(2),
      [`TOTAL % Amount`]: grandP.toFixed(2)
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredData), 'Detailed Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary');

    const filename = `report-panel-${panelId}-${Date.now()}.xlsx`;
    const filepath = path.join(outputDir, filename);
    XLSX.writeFile(wb, filepath);

    res.json({
      success: true,
      summary: summaryData,
      downloadUrl: `/output/${filename}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to generate summary' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
