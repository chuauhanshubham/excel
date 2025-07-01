const mongoose = require('mongoose');

const UploadedFileSchema = new mongoose.Schema({
  panelId: String,
  originalName: String,
  filePath: String,
  uploadedAt: { type: Date, default: Date.now },
  merchants: [String],
  data: [mongoose.Schema.Types.Mixed]
});

module.exports = mongoose.model('UploadedFile', UploadedFileSchema);
