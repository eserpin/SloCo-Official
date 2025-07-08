const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

// === Replace these values with your actual R2 info ===
const accessKeyId = "d94f471450ffc187eeef087ad8239321";
const secretAccessKey = "51c3515549399c21e0c2e7a733935841c28a048e269e8808c691e2ee20f7c9fe";
const accountId = "e13d4858b9bcb13cee630426d21ba396"; // This is the subdomain in your R2 endpoint
const bucket = "nandi";
const region = "auto"; // Always "auto" for R2
const key = "digital/Nandi.pdf"; // Destination key in R2
const filePath = path.join(__dirname, "Nandi.pdf"); // Local file path

// === S3 client for Cloudflare R2 ===
const s3 = new S3Client({
  region,
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function uploadPDF() {
  const fileStream = fs.createReadStream(filePath);

  const uploadParams = {
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: "application/pdf",
  };

  try {
    const result = await s3.send(new PutObjectCommand(uploadParams));
    console.log("✅ Upload successful!", result);
  } catch (err) {
    console.error("❌ Upload failed:", err);
  }
}

uploadPDF();
