const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mock AI parsing engine (can be hooked to OpenAI/Gemini API key via process.env.API_KEY)
app.post('/api/parse-prompt', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Regex extraction simulating an AI parsing step for standard text inputs
  // e.g.: "Invoice Acme Corp for 5 hours of consulting at $120/hr and $50 for hosting"
  const clientMatch = prompt.match(/(?:to|for)\s+([A-Za-z0-9\s]+?)(?=\s+for|\s+with|\.|$)/i);
  const clientName = clientMatch ? clientMatch[1].trim() : 'Valued Client';

  res.json({
    invoiceNumber: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
    date: new Date().toISOString().split('T')[0],
    client: { name: clientName },
    items: [
      { description: "Services rendered based on: " + prompt, qty: 1, rate: 250 }
    ],
    taxRate: 10
  });
});

// Server-side PDF Generator using Headless Chromium inside Docker
app.post('/api/generate-pdf', async (req, res) => {
  const invoiceData = req.body;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
        .title { font-size: 28px; font-weight: 800; color: #4f46e5; }
        .table { width: 100%; border-collapse: collapse; margin-top: 30px; }
        .table th { background: #f8fafc; text-align: left; padding: 10px; border-bottom: 1px solid #cbd5e1; font-size: 12px; text-transform: uppercase; }
        .table td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        .total-box { margin-top: 30px; text-align: right; font-size: 18px; font-weight: 700; }
        .footer { margin-top: 50px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">INVOICE</div>
          <p># ${invoiceData.invoiceNumber || 'INV-001'}</p>
        </div>
        <div style="text-align: right;">
          <p><strong>Date:</strong> ${invoiceData.date || new Date().toISOString().split('T')[0]}</p>
          <p><strong>Client:</strong> ${invoiceData.client?.name || 'Client'}</p>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Rate</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${(invoiceData.items || []).map(item => `
            <tr>
              <td>${item.description}</td>
              <td style="text-align: center;">${item.qty}</td>
              <td style="text-align: right;">$${Number(item.rate).toFixed(2)}</td>               <td style="text-align: right;">$${(item.qty * item.rate).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="total-box">
        Total: $${(invoiceData.items || []).reduce((acc, i) => acc + (i.qty * i.rate), 0).toFixed(2)}
      </div>

      <div class="footer">
        Generated securely by Server-side Docker Engine.
      </div>
    </body>
    </html>
  `;

  let browser;
  try {
    // Puppeteer needs flags to run without a GUI inside a container
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=invoice.pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Generation Failed:', error);
    res.status(500).json({ error: 'Failed to generate PDF in container environment.' });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Invoice engine container listening on port ${PORT}`);
});