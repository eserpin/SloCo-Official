const express = require('express');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../config/s3Client'); // Import the configured Cloudflare R2 client

const router = express.Router();

// Route to get image URLs for a specific chapter
  router.get('/:chapter', async (req, res) => {
  try {
    const { chapter } = req.params;
    if (!chapter) {
      return res.status(400).json({ error: "Chapter number is required" });
    }

    // List objects in the chapter folder
    const params = {
      Bucket: 'nandi',
      Prefix: `${chapter}/`,
    };

    const data = await s3.send(new ListObjectsV2Command(params));

    if (!data.Contents) {
      return res.status(404).json({ error: "No images found for this chapter" });
    }

    // Generate signed URLs for each file
    const signedImageUrls = await Promise.all(
      data.Contents.map(async (file) => {
        const signedUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: 'nandi', Key: file.Key }),
          { expiresIn: 3600 } // URL expires in 1 hour
        );
        return { url: signedUrl, key: file.Key };
      })
    );

    // Sort by numerical page number (assuming file names are '1.jpg', '2.jpg', etc.)
    signedImageUrls.sort((a, b) => {
      const numA = parseInt(a.key.split('/').pop().split('.')[0], 10);
      const numB = parseInt(b.key.split('/').pop().split('.')[0], 10);
      return numA - numB;
    });

    res.status(200).json({ images: signedImageUrls.map(obj => obj.url) });
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Failed to retrieve images" });
  }
});

module.exports = router;

