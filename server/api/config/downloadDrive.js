const { google } = require('googleapis');
const getDownloadUrl = async (fileId) => {
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.PDF_SERVICE_KEY), scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth });
  const { data } = await drive.files.get({ fileId, fields: 'webContentLink' });
  if (!data.webContentLink) throw new Error('File download is unavailable');
  return data.webContentLink;
};
module.exports = { getDownloadUrl };
