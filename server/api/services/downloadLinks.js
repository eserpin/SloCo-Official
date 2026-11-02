const getDownloadPageLink = (token) => {
  if (process.env.FRONTEND_URL) return `${process.env.FRONTEND_URL.replace(/\/+$/, '')}/download/${encodeURIComponent(token)}`;
  return `${process.env.BACKEND_URL.replace(/\/+$/, '')}/api/download/${encodeURIComponent(token)}`;
};
module.exports = { getDownloadPageLink };
