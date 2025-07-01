const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  panelId: String,
  startDate: String,
  endDate: String,
  merchantPercents: mongoose.Schema.Types.Mixed,
  summary: [mongoose.Schema.Types.Mixed],
  downloadUrl: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', ReportSchema);
