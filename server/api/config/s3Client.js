const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.CF_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CF_ACCESS,
    secretAccessKey: process.env.CF_SECRET,
  },
});

module.exports = s3;
